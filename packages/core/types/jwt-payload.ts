export type JwtPayload = {
  username: string;
  sub: number;
  iat: number;
  refresh?: boolean;
};
