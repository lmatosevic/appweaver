/** The roles the routes and policies check. */
export const Role = {
  /** Manages the teams, the SLA policies, and the accounts */
  Admin: 'Admin',
  /** Works the tickets */
  Agent: 'Agent',
  /** Another system opening tickets with an API key, i.e. a status page */
  Integration: 'Integration'
} as const;

/** The support staff. */
export const staff = [Role.Admin, Role.Agent];
