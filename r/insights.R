# ------------------------------------------------------------------------------
# insights.R  -  Driver Drowsiness Detection: analysis of saved driving sessions
#
# Reads the sessions from the app's SQLite database, makes charts with ggplot2,
# runs a few statistical tests and writes everything to frontend/insights/ so the
# Insights page of the website can show it.
#
# Usage (from the project folder):
#   Rscript r/install_packages.R                       # once
#   Rscript r/insights.R backend/drowsiguard.db frontend/insights
#
# The website's "Run R analysis again" button runs the same command.
# ------------------------------------------------------------------------------

suppressPackageStartupMessages({
  library(DBI)
  library(RSQLite)
  library(dplyr)
  library(ggplot2)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
db_path <- if (length(args) >= 1) args[1] else "backend/drowsiguard.db"
out_dir <- if (length(args) >= 2) args[2] else "frontend/insights"
dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)

MIN_SESSIONS <- 10   # below this we add example data so the charts are not empty
ALPHA <- 0.05
TYPE_LABELS <- c(personal = "Personal car", cab = "Cab / taxi", truck = "Truck")

# ---------------------------------------------------------------- 1. load data

con <- dbConnect(SQLite(), db_path)
sessions <- dbGetQuery(con, "
  SELECT s.id, s.user_id, s.started_at, s.duration_seconds, s.avg_probability,
         s.max_probability, s.avg_perclos, s.total_blinks, s.total_yawns,
         s.microsleeps, s.alerts, s.events,
         COALESCE(s.driver_type, u.driver_type) AS driver_type
  FROM driving_sessions s
  JOIN users u ON u.id = s.user_id
")
dbDisconnect(con)

sessions <- sessions %>%
  filter(duration_seconds >= 30) %>%   # ignore very short test sessions
  mutate(
    started_at = as.POSIXct(substr(started_at, 1, 19), format = "%Y-%m-%d %H:%M:%S", tz = "UTC"),
    started_at = as.POSIXct(format(started_at, tz = Sys.timezone()), tz = Sys.timezone()),
    driver_type = ifelse(is.na(driver_type), "personal", driver_type),
    demo = FALSE
  )

# ------------------------------------------- 2. example data if too few sessions

make_demo_sessions <- function(n = 60) {
  set.seed(42)
  type <- sample(c("personal", "cab", "truck"), n, replace = TRUE, prob = c(0.4, 0.35, 0.25))
  hour <- sample(0:23, n, replace = TRUE)
  night <- hour >= 22 | hour < 6
  minutes <- round(ifelse(type == "truck", runif(n, 40, 240), runif(n, 10, 90)))
  prob <- plogis(-1.6 + 0.9 * night + 0.004 * minutes + 0.3 * (type == "cab") + 0.5 * (type == "truck") + rnorm(n, 0, 0.6))
  perclos <- pmin(1, pmax(0, 0.03 + 0.25 * prob + rnorm(n, 0, 0.02)))
  hours <- minutes / 60
  data.frame(
    id = -(1:n),
    user_id = sample(1:8, n, replace = TRUE),
    # build the time in the local time zone so "hour" is not shifted later on
    started_at = as.POSIXct(paste(Sys.Date() - sample(0:20, n, replace = TRUE), sprintf("%02d:00:00", hour)),
                            tz = Sys.timezone()),
    duration_seconds = minutes * 60,
    avg_probability = prob,
    max_probability = pmin(1, prob + runif(n, 0.05, 0.4)),
    avg_perclos = perclos,
    total_blinks = round(hours * 60 * runif(n, 10, 20)),
    total_yawns = rpois(n, hours * (1 + 4 * prob)),
    microsleeps = rpois(n, hours * 6 * prob^2),
    alerts = rpois(n, hours * 4 * prob^2),
    events = "[]",
    driver_type = type,
    demo = TRUE,
    stringsAsFactors = FALSE
  )
}

demo_data <- nrow(sessions) < MIN_SESSIONS
if (demo_data) sessions <- bind_rows(sessions, make_demo_sessions())

sessions <- sessions %>%
  mutate(
    hours = duration_seconds / 3600,
    minutes = duration_seconds / 60,
    hour = as.integer(format(started_at, "%H")),
    day = as.Date(started_at),
    night = hour >= 22 | hour < 6,
    period = ifelse(night, "Night (22-06)", "Day"),
    type_label = factor(TYPE_LABELS[driver_type], levels = TYPE_LABELS)
  )

# events are stored as JSON text: [{"t":..,"type":"yawn","detail":".."}, ...]
event_types <- unlist(lapply(sessions$events, function(txt) {
  if (is.na(txt) || txt == "" || txt == "[]") return(character(0))
  ev <- tryCatch(fromJSON(txt), error = function(e) NULL)
  if (is.null(ev) || !("type" %in% names(ev))) character(0) else ev$type
}))
# example sessions have no event list, use their counters instead
if (demo_data) {
  demo <- sessions[sessions$demo, ]
  event_types <- c(event_types,
                   rep("microsleep", sum(demo$microsleeps)),
                   rep("yawn", sum(demo$total_yawns)),
                   rep("critical", sum(demo$alerts)))
}

# ---------------------------------------------------------------- 3. charts

theme_set(theme_bw(base_size = 12))
save_plot <- function(p, name) {
  ggsave(file.path(out_dir, name), p, width = 7, height = 4.2, dpi = 110)
}

by_hour <- sessions %>% group_by(hour) %>% summarise(mean_prob = mean(avg_probability), n = n(), .groups = "drop")
p1 <- ggplot(by_hour, aes(x = hour, y = mean_prob, fill = hour >= 22 | hour < 6)) +
  geom_col() +
  geom_text(aes(label = n), vjust = -0.4, size = 3) +
  scale_fill_manual(values = c(`FALSE` = "#1a5aa6", `TRUE` = "#c62828"), labels = c("Day", "Night"), name = NULL) +
  scale_x_continuous(breaks = seq(0, 23, 2)) +
  labs(x = "Hour of the day", y = "Mean drowsiness probability", caption = "Numbers above bars = sessions")
save_plot(p1, "risk_by_hour.png")

p2 <- ggplot(sessions, aes(x = type_label, y = avg_probability)) +
  geom_boxplot(fill = "#dbe6f4", outlier.shape = NA) +
  geom_jitter(width = 0.15, alpha = 0.5, size = 1.5) +
  labs(x = NULL, y = "Mean drowsiness probability per session")
save_plot(p2, "risk_by_driver_type.png")

if (length(event_types) > 0) {
  ev_labels <- c(microsleep = "Microsleep", critical = "Alarm", drowsy = "Drowsy",
                 yawn = "Yawn", `head-nod` = "Head nod", `break` = "Break")
  ev <- as.data.frame(table(event = event_types), stringsAsFactors = FALSE)
  ev$label <- ifelse(ev$event %in% names(ev_labels), ev_labels[ev$event], ev$event)
  p3 <- ggplot(ev, aes(x = reorder(label, Freq), y = Freq)) +
    geom_col(fill = "#d9822b") +
    coord_flip() +
    labs(x = NULL, y = "Number of events")
  save_plot(p3, "events_by_type.png")
}

p4 <- ggplot(sessions, aes(x = minutes, y = avg_probability)) +
  geom_point(aes(colour = type_label), alpha = 0.7) +
  geom_smooth(method = "lm", formula = y ~ x, colour = "black", se = TRUE) +
  scale_colour_manual(values = c("#2e7d32", "#d9822b", "#1a5aa6"), name = NULL, drop = FALSE) +
  labs(x = "Session length (minutes)", y = "Mean drowsiness probability")
save_plot(p4, "duration_vs_risk.png")

p5 <- ggplot(sessions, aes(x = avg_perclos * 100)) +
  geom_histogram(bins = 15, fill = "#1a5aa6", colour = "white") +
  geom_vline(xintercept = 15, linetype = "dashed", colour = "#c62828") +
  labs(x = "Mean PERCLOS per session (%)", y = "Sessions", caption = "Dashed line: 15 %, often used as a drowsiness level")
save_plot(p5, "perclos_distribution.png")

by_day <- sessions %>% group_by(day) %>% summarise(mean_prob = mean(avg_probability), .groups = "drop")
if (nrow(by_day) >= 2) {
  p6 <- ggplot(by_day, aes(x = day, y = mean_prob)) +
    geom_line(colour = "#1a5aa6") +
    geom_point(colour = "#1a5aa6") +
    labs(x = NULL, y = "Mean drowsiness probability")
  save_plot(p6, "daily_trend.png")
} else if (file.exists(file.path(out_dir, "daily_trend.png"))) {
  file.remove(file.path(out_dir, "daily_trend.png"))
}

# ---------------------------------------------------------------- 4. tests

result_row <- function(question, test, statistic, p_value, yes, no) {
  if (is.null(p_value) || is.na(p_value)) {
    return(list(question = question, test = test, statistic = NULL, p_value = NULL,
                conclusion = "Not enough data"))
  }
  list(question = question, test = test, statistic = unname(statistic), p_value = p_value,
       conclusion = if (p_value < ALPHA) yes else no)
}

tests <- list()

# a) does drowsiness differ between driver types?
type_counts <- table(sessions$driver_type)
if (sum(type_counts >= 2) >= 2) {
  kw <- kruskal.test(avg_probability ~ driver_type, data = sessions[sessions$driver_type %in% names(type_counts[type_counts >= 2]), ])
  tests[[length(tests) + 1]] <- result_row("Does drowsiness differ between driver types?", "Kruskal-Wallis",
                                           kw$statistic, kw$p.value, "Yes, significant difference", "No significant difference")
} else {
  tests[[length(tests) + 1]] <- result_row("Does drowsiness differ between driver types?", "Kruskal-Wallis", NA, NA, "", "")
}

# b) is it worse at night?
if (sum(sessions$night) >= 2 && sum(!sessions$night) >= 2) {
  wt <- wilcox.test(avg_probability ~ night, data = sessions, exact = FALSE)
  night_higher <- mean(sessions$avg_probability[sessions$night]) > mean(sessions$avg_probability[!sessions$night])
  tests[[length(tests) + 1]] <- result_row("Are drivers drowsier at night (22-06)?", "Wilcoxon rank-sum",
                                           wt$statistic, wt$p.value,
                                           if (night_higher) "Yes, higher at night" else "Significant, but lower at night",
                                           "No significant difference")
} else {
  tests[[length(tests) + 1]] <- result_row("Are drivers drowsier at night (22-06)?", "Wilcoxon rank-sum", NA, NA, "", "")
}

# c) do longer sessions get drowsier?
if (nrow(sessions) >= 5) {
  fit <- lm(avg_probability ~ minutes, data = sessions)
  co <- summary(fit)$coefficients
  slope <- co["minutes", "Estimate"]
  tests[[length(tests) + 1]] <- result_row(
    "Does drowsiness increase with session length?",
    sprintf("Linear regression (slope = %+.4f per min)", slope),
    co["minutes", "t value"], co["minutes", "Pr(>|t|)"],
    if (slope > 0) "Yes, longer drives are drowsier" else "Significant, but decreasing",
    "No significant trend")
}

# d) does PERCLOS go together with microsleeps?
if (nrow(sessions) >= 5 && sd(sessions$microsleeps / sessions$hours) > 0) {
  ct <- suppressWarnings(cor.test(sessions$avg_perclos, sessions$microsleeps / sessions$hours, method = "spearman"))
  tests[[length(tests) + 1]] <- result_row(
    "Is PERCLOS related to microsleeps per hour?",
    sprintf("Spearman correlation (rho = %.2f)", ct$estimate),
    ct$estimate, ct$p.value, "Yes, significant correlation", "No significant correlation")
}

# ---------------------------------------------------------------- 5. summary

by_type <- sessions %>%
  group_by(driver_type) %>%
  summarise(
    sessions = n(),
    hours = sum(hours),
    mean_probability = mean(avg_probability),
    microsleeps_per_hour = sum(microsleeps) / sum(hours),
    alarms_per_hour = sum(alerts) / sum(hours),
    .groups = "drop"
  ) %>%
  mutate(driver_type = unname(TYPE_LABELS[driver_type]))

findings <- c()
worst_hour <- by_hour$hour[which.max(by_hour$mean_prob)]
findings <- c(findings, sprintf("The highest average drowsiness was around %02d:00.", worst_hour))
if (nrow(by_type) >= 2) {
  worst <- by_type[which.max(by_type$mean_probability), ]
  findings <- c(findings, sprintf("%s drivers had the highest mean drowsiness probability (%.0f %%).",
                                  worst$driver_type, 100 * worst$mean_probability))
}
high_perclos <- mean(sessions$avg_perclos > 0.15)
findings <- c(findings, sprintf("%.0f %% of sessions had a mean PERCLOS above 15 %%.", 100 * high_perclos))
for (t in tests) if (!is.null(t$p_value) && t$p_value < ALPHA) findings <- c(findings, paste0(t$question, " ", t$conclusion, "."))
if (demo_data) findings <- c(findings, "These results include randomly generated example sessions and are only a demonstration.")

summary <- list(
  generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z"),
  r_version = paste(R.version$major, R.version$minor, sep = "."),
  demo_data = demo_data,
  n_sessions = nrow(sessions),
  n_drivers = length(unique(sessions$user_id)),
  total_hours = sum(sessions$hours),
  mean_probability = weighted.mean(sessions$avg_probability, sessions$hours),
  microsleeps_per_hour = sum(sessions$microsleeps) / sum(sessions$hours),
  findings = findings,
  tests = tests,
  by_driver_type = by_type
)
write_json(summary, file.path(out_dir, "summary.json"), auto_unbox = TRUE, pretty = TRUE, null = "null", digits = 6)
cat("Insights written to", normalizePath(out_dir), "\n")
