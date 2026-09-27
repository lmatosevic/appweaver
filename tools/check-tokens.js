require('dotenv/config');

// Asks each service who the token belongs to, so an expired or mistyped token
// stops the release before anything is built, versioned or published
const checks = [
  {
    name: 'NPM_TOKEN',
    token: process.env.NPM_TOKEN,
    url: 'https://registry.npmjs.org/-/whoami',
    user: (body) => body.username
  },
  {
    name: 'GITHUB_TOKEN',
    token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
    url: 'https://api.github.com/user',
    user: (body) => body.login
  }
];

async function check({ name, token, url, user }) {
  if (!token) {
    return `${name} is not set`;
  }

  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, 'user-agent': 'appweaver' }
    });
    if (!response.ok) {
      // Read to the end, so the connection is released
      await response.text();
      return `${name} was rejected (${response.status} ${response.statusText})`;
    }

    console.log(
      `${name} is valid, authenticated as ${user(await response.json())}`
    );
  } catch (e) {
    return `${name} could not be checked: ${e.message}`;
  }
}

Promise.all(checks.map(check)).then((errors) => {
  const failed = errors.filter(Boolean);
  for (const error of failed) {
    console.error(error);
  }
  // Exiting right away while fetch closes its connections crashes Node on Windows
  process.exitCode = failed.length > 0 ? 1 : 0;
});
