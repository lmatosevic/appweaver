/** The roles the routes check. Members sign up, curators run the catalog. */
export const Role = {
  Admin: 'Admin',
  Curator: 'Curator',
  Member: 'Member'
} as const;

/** The roles allowed to change the catalog. */
export const catalogEditors = [Role.Admin, Role.Curator];
