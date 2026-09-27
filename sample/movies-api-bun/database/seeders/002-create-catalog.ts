import { db } from '@db/client';

type Role = 'Cast' | 'Director' | 'Writer' | 'Producer' | 'Composer';

const genres = [
  'Science Fiction',
  'Drama',
  'Thriller',
  'Action',
  'Adventure',
  'Comedy',
  'Animation',
  'Fantasy'
];

const people: {
  name: string;
  knownFor: 'Acting' | 'Directing' | 'Writing' | 'Music';
  birthDate: string;
  birthPlace: string;
}[] = [
  {
    name: 'Denis Villeneuve',
    knownFor: 'Directing',
    birthDate: '1967-10-03',
    birthPlace: 'Gentilly, Quebec, Canada'
  },
  {
    name: 'Christopher Nolan',
    knownFor: 'Directing',
    birthDate: '1970-07-30',
    birthPlace: 'London, England'
  },
  {
    name: 'Bong Joon Ho',
    knownFor: 'Directing',
    birthDate: '1969-09-14',
    birthPlace: 'Daegu, South Korea'
  },
  {
    name: 'Hayao Miyazaki',
    knownFor: 'Directing',
    birthDate: '1941-01-05',
    birthPlace: 'Tokyo, Japan'
  },
  {
    name: 'George Miller',
    knownFor: 'Directing',
    birthDate: '1945-03-03',
    birthPlace: 'Chinchilla, Queensland, Australia'
  },
  {
    name: 'Wes Anderson',
    knownFor: 'Directing',
    birthDate: '1969-05-01',
    birthPlace: 'Houston, Texas, USA'
  },
  {
    name: 'Hans Zimmer',
    knownFor: 'Music',
    birthDate: '1957-09-12',
    birthPlace: 'Frankfurt, Germany'
  },
  {
    name: 'Joe Hisaishi',
    knownFor: 'Music',
    birthDate: '1950-12-06',
    birthPlace: 'Nakano, Nagano, Japan'
  },
  {
    name: 'Amy Adams',
    knownFor: 'Acting',
    birthDate: '1974-08-20',
    birthPlace: 'Vicenza, Italy'
  },
  {
    name: 'Ryan Gosling',
    knownFor: 'Acting',
    birthDate: '1980-11-12',
    birthPlace: 'London, Ontario, Canada'
  },
  {
    name: 'Harrison Ford',
    knownFor: 'Acting',
    birthDate: '1942-07-13',
    birthPlace: 'Chicago, Illinois, USA'
  },
  {
    name: 'Timothée Chalamet',
    knownFor: 'Acting',
    birthDate: '1995-12-27',
    birthPlace: 'New York City, USA'
  },
  {
    name: 'Zendaya',
    knownFor: 'Acting',
    birthDate: '1996-09-01',
    birthPlace: 'Oakland, California, USA'
  },
  {
    name: 'Rebecca Ferguson',
    knownFor: 'Acting',
    birthDate: '1983-10-19',
    birthPlace: 'Stockholm, Sweden'
  },
  {
    name: 'Oscar Isaac',
    knownFor: 'Acting',
    birthDate: '1979-03-09',
    birthPlace: 'Guatemala City, Guatemala'
  },
  {
    name: 'Leonardo DiCaprio',
    knownFor: 'Acting',
    birthDate: '1974-11-11',
    birthPlace: 'Los Angeles, California, USA'
  },
  {
    name: 'Tom Hardy',
    knownFor: 'Acting',
    birthDate: '1977-09-15',
    birthPlace: 'London, England'
  },
  {
    name: 'Matthew McConaughey',
    knownFor: 'Acting',
    birthDate: '1969-11-04',
    birthPlace: 'Uvalde, Texas, USA'
  },
  {
    name: 'Anne Hathaway',
    knownFor: 'Acting',
    birthDate: '1982-11-12',
    birthPlace: 'New York City, USA'
  },
  {
    name: 'Jessica Chastain',
    knownFor: 'Acting',
    birthDate: '1977-03-24',
    birthPlace: 'Sacramento, California, USA'
  },
  {
    name: 'Song Kang-ho',
    knownFor: 'Acting',
    birthDate: '1967-01-17',
    birthPlace: 'Gimhae, South Korea'
  },
  {
    name: 'Charlize Theron',
    knownFor: 'Acting',
    birthDate: '1975-08-07',
    birthPlace: 'Benoni, South Africa'
  },
  {
    name: 'Ralph Fiennes',
    knownFor: 'Acting',
    birthDate: '1962-12-22',
    birthPlace: 'Ipswich, England'
  }
];

const movies: {
  title: string;
  slug: string;
  originalTitle?: string;
  tagline?: string;
  overview: string;
  releaseDate: string;
  runtimeMinutes: number;
  language: string;
  budgetUsd?: number;
  revenueUsd?: number;
  keywords: string[];
  genres: string[];
  credits: [string, Role, string?][];
}[] = [
  {
    title: 'Arrival',
    slug: 'arrival-2016',
    tagline: 'Why are they here?',
    overview:
      'A linguist is recruited to communicate with the visitors of twelve spacecraft that touched down around the world.',
    releaseDate: '2016-11-11',
    runtimeMinutes: 116,
    language: 'en',
    budgetUsd: 47_000_000,
    revenueUsd: 203_400_000,
    keywords: ['first contact', 'linguistics', 'time'],
    genres: ['Science Fiction', 'Drama'],
    credits: [
      ['Denis Villeneuve', 'Director'],
      ['Amy Adams', 'Cast', 'Louise Banks']
    ]
  },
  {
    title: 'Blade Runner 2049',
    slug: 'blade-runner-2049',
    overview:
      'A young blade runner unearths a long-buried secret that leads him to track down a former blade runner missing for thirty years.',
    releaseDate: '2017-10-06',
    runtimeMinutes: 164,
    language: 'en',
    keywords: ['replicant', 'dystopia', 'neo-noir'],
    genres: ['Science Fiction', 'Drama', 'Thriller'],
    credits: [
      ['Denis Villeneuve', 'Director'],
      ['Hans Zimmer', 'Composer'],
      ['Ryan Gosling', 'Cast', 'K'],
      ['Harrison Ford', 'Cast', 'Rick Deckard']
    ]
  },
  {
    title: 'Dune',
    slug: 'dune-2021',
    overview:
      'The heir of a noble family is thrust into a war for the most valuable resource in the galaxy on the desert planet Arrakis.',
    releaseDate: '2021-10-22',
    runtimeMinutes: 155,
    language: 'en',
    keywords: ['desert', 'prophecy', 'space opera'],
    genres: ['Science Fiction', 'Adventure'],
    credits: [
      ['Denis Villeneuve', 'Director'],
      ['Hans Zimmer', 'Composer'],
      ['Timothée Chalamet', 'Cast', 'Paul Atreides'],
      ['Rebecca Ferguson', 'Cast', 'Lady Jessica'],
      ['Oscar Isaac', 'Cast', 'Duke Leto Atreides'],
      ['Zendaya', 'Cast', 'Chani']
    ]
  },
  {
    title: 'Dune: Part Two',
    slug: 'dune-part-two-2024',
    overview:
      'Paul Atreides unites with the Fremen to seek revenge against the conspirators who destroyed his family.',
    releaseDate: '2024-03-01',
    runtimeMinutes: 166,
    language: 'en',
    keywords: ['desert', 'revenge', 'space opera'],
    genres: ['Science Fiction', 'Adventure', 'Action'],
    credits: [
      ['Denis Villeneuve', 'Director'],
      ['Hans Zimmer', 'Composer'],
      ['Timothée Chalamet', 'Cast', 'Paul Atreides'],
      ['Zendaya', 'Cast', 'Chani'],
      ['Rebecca Ferguson', 'Cast', 'Lady Jessica']
    ]
  },
  {
    title: 'Inception',
    slug: 'inception-2010',
    tagline: 'Your mind is the scene of the crime.',
    overview:
      'A thief who steals secrets from dreams is offered a chance to erase his past by planting an idea instead.',
    releaseDate: '2010-07-16',
    runtimeMinutes: 148,
    language: 'en',
    budgetUsd: 160_000_000,
    keywords: ['dream', 'heist', 'subconscious'],
    genres: ['Science Fiction', 'Action', 'Thriller'],
    credits: [
      ['Christopher Nolan', 'Director'],
      ['Christopher Nolan', 'Writer'],
      ['Hans Zimmer', 'Composer'],
      ['Leonardo DiCaprio', 'Cast', 'Cobb'],
      ['Tom Hardy', 'Cast', 'Eames']
    ]
  },
  {
    title: 'Interstellar',
    slug: 'interstellar-2014',
    tagline: 'Mankind was born on Earth. It was never meant to die here.',
    overview:
      'A team of explorers travels through a wormhole in search of a new home for humanity.',
    releaseDate: '2014-11-07',
    runtimeMinutes: 169,
    language: 'en',
    keywords: ['wormhole', 'space travel', 'father daughter relationship'],
    genres: ['Science Fiction', 'Drama', 'Adventure'],
    credits: [
      ['Christopher Nolan', 'Director'],
      ['Hans Zimmer', 'Composer'],
      ['Matthew McConaughey', 'Cast', 'Cooper'],
      ['Anne Hathaway', 'Cast', 'Brand'],
      ['Jessica Chastain', 'Cast', 'Murph']
    ]
  },
  {
    title: 'Parasite',
    slug: 'parasite-2019',
    originalTitle: '기생충',
    overview:
      'A poor family schemes its way into the household of a wealthy one, until an unexpected discovery upends both.',
    releaseDate: '2019-05-30',
    runtimeMinutes: 132,
    language: 'ko',
    keywords: ['class differences', 'con artist', 'dark comedy'],
    genres: ['Thriller', 'Drama', 'Comedy'],
    credits: [
      ['Bong Joon Ho', 'Director'],
      ['Bong Joon Ho', 'Writer'],
      ['Song Kang-ho', 'Cast', 'Kim Ki-taek']
    ]
  },
  {
    title: 'Spirited Away',
    slug: 'spirited-away-2001',
    originalTitle: '千と千尋の神隠し',
    overview:
      'A girl wanders into a world of spirits and must work in a bathhouse to free herself and her parents.',
    releaseDate: '2001-07-20',
    runtimeMinutes: 125,
    language: 'ja',
    keywords: ['spirits', 'bathhouse', 'coming of age'],
    genres: ['Animation', 'Fantasy', 'Adventure'],
    credits: [
      ['Hayao Miyazaki', 'Director'],
      ['Hayao Miyazaki', 'Writer'],
      ['Joe Hisaishi', 'Composer']
    ]
  },
  {
    title: 'Mad Max: Fury Road',
    slug: 'mad-max-fury-road-2015',
    tagline: 'What a lovely day.',
    overview:
      'In a post-apocalyptic wasteland, a drifter and a rebel warrior flee a tyrant across the desert.',
    releaseDate: '2015-05-15',
    runtimeMinutes: 120,
    language: 'en',
    keywords: ['post-apocalyptic', 'chase', 'desert'],
    genres: ['Action', 'Adventure', 'Science Fiction'],
    credits: [
      ['George Miller', 'Director'],
      ['Tom Hardy', 'Cast', 'Max Rockatansky'],
      ['Charlize Theron', 'Cast', 'Imperator Furiosa']
    ]
  },
  {
    title: 'The Grand Budapest Hotel',
    slug: 'the-grand-budapest-hotel-2014',
    overview:
      'The concierge of a famous European hotel and his lobby boy are caught up in the theft of a priceless painting.',
    releaseDate: '2014-03-07',
    runtimeMinutes: 99,
    language: 'en',
    keywords: ['hotel', 'caper', 'friendship'],
    genres: ['Comedy', 'Drama'],
    credits: [
      ['Wes Anderson', 'Director'],
      ['Wes Anderson', 'Writer'],
      ['Ralph Fiennes', 'Cast', 'M. Gustave']
    ]
  }
];

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Genres, people, and ten well-known movies with their key cast and crew. */
export async function createCatalog(): Promise<string> {
  const genreIds = new Map<string, number>();
  for (const name of genres) {
    const genre = await db.genre.create({
      data: { name, slug: slugify(name) }
    });
    genreIds.set(name, genre.id);
  }

  const personIds = new Map<string, number>();
  for (const person of people) {
    const created = await db.person.create({
      data: {
        ...person,
        slug: slugify(person.name),
        birthDate: new Date(`${person.birthDate}T00:00:00.000Z`)
      }
    });
    personIds.set(person.name, created.id);
  }

  for (const { genres: movieGenres, credits, ...movie } of movies) {
    const created = await db.movie.create({
      data: {
        ...movie,
        releaseDate: new Date(`${movie.releaseDate}T00:00:00.000Z`),
        genres: {
          connect: movieGenres.map((name) => ({ id: genreIds.get(name)! }))
        }
      }
    });

    let billingOrder = 0;
    for (const [name, role, character] of credits) {
      await db.credit.create({
        data: {
          movieId: created.id,
          personId: personIds.get(name)!,
          role,
          character,
          billingOrder: role === 'Cast' ? billingOrder++ : 0
        }
      });
    }
  }

  return `Seeded ${movies.length} movies and ${people.length} people`;
}
