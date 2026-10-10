# Run once:  Rscript r/install_packages.R
#
# Packages go into your personal R library (no admin rights needed).
user_lib <- Sys.getenv("R_LIBS_USER")
dir.create(user_lib, recursive = TRUE, showWarnings = FALSE)
.libPaths(c(user_lib, .libPaths()))

packages <- c("DBI", "RSQLite", "dplyr", "ggplot2", "jsonlite")
missing <- packages[!packages %in% rownames(installed.packages())]
if (length(missing) > 0) {
  install.packages(missing, lib = user_lib, repos = "https://cloud.r-project.org")
} else {
  cat("All R packages are already installed.\n")
}
