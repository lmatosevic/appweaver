/** The roles the routes check. */
export const Role = {
  /** Runs the fleet: vehicles, geofences, routes, and the accounts */
  Admin: 'Admin',
  /** Watches the live map, assigns the drivers and routes, handles the alerts */
  Dispatcher: 'Dispatcher',
  /** Drives a vehicle, and sees its own vehicles and trips */
  Driver: 'Driver',
  /** The telematics gateway, reporting the pings of the trackers with an API key */
  Tracker: 'Tracker'
} as const;
