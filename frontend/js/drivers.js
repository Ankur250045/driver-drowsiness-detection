// drivers.js
// Settings and screen layout for each type of driver.
//
// personal: ordinary car owner – normal sensitivity, simple trip timer.
// cab:      long city shifts, often at night – shift timer, break reminder every
//           2 hours, extra sensitivity at night, quieter alarm when a passenger is on board.
// truck:    long-distance driving – most sensitive thresholds and a driving-hours
//           log with a compulsory break (4.5 h driving → 45 min break, as in EU rule 561/2006).

export const DRIVER_TYPES = {
  personal: {
    label: 'Personal car driver',
    short: 'Car',
    description: 'Daily commute or occasional long trips in your own car.',
    settings: { microsleepSeconds: 1.0, drowsyProbability: 0.5, criticalProbability: 0.85 },
    timerLabel: 'Trip time',
    breakEveryMinutes: 120,
    breakLengthMinutes: 15,
    breakRequired: false,
    nightMode: false,
    passengerMode: false,
    contactLabel: 'Family member',
  },
  cab: {
    label: 'Cab / taxi driver',
    short: 'Cab',
    description: 'Long city shifts, many short trips, often late at night.',
    settings: { microsleepSeconds: 1.0, drowsyProbability: 0.45, criticalProbability: 0.8 },
    timerLabel: 'Shift time',
    breakEveryMinutes: 120,
    breakLengthMinutes: 15,
    breakRequired: false,
    nightMode: true,
    passengerMode: true,
    contactLabel: 'Cab company or family member',
  },
  truck: {
    label: 'Truck driver',
    short: 'Truck',
    description: 'Long-distance highway driving with heavy vehicles.',
    settings: { microsleepSeconds: 0.8, drowsyProbability: 0.4, criticalProbability: 0.75 },
    timerLabel: 'Driving time since last break',
    breakEveryMinutes: 270,
    breakLengthMinutes: 45,
    breakRequired: true,
    nightMode: true,
    passengerMode: false,
    contactLabel: 'Fleet manager',
  },
};

// Between 22:00 and 06:00 the body clock makes drowsiness more likely, so for
// cab and truck drivers the thresholds are lowered a little at night.
export function isNight(date = new Date()) {
  const h = date.getHours();
  return h >= 22 || h < 6;
}

export function settingsFor(type, date = new Date()) {
  const profile = DRIVER_TYPES[type] || DRIVER_TYPES.personal;
  const s = { ...profile.settings };
  if (profile.nightMode && isNight(date)) {
    s.drowsyProbability = Math.max(0.3, s.drowsyProbability - 0.05);
    s.criticalProbability = Math.max(0.6, s.criticalProbability - 0.05);
  }
  return s;
}
