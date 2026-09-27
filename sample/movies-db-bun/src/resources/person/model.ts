import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Person',
  scalars: {
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 150,
      example: 'Denis Villeneuve'
    },
    slug: {
      type: 'string',
      unique: true,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      example: 'denis-villeneuve'
    },
    knownFor: {
      type: 'enum',
      values: ['Acting', 'Directing', 'Writing', 'Producing', 'Music'],
      default: 'Acting'
    },
    birthDate: {
      type: 'dateTime',
      required: false,
      example: '1967-10-03T00:00:00.000Z'
    },
    deathDate: {
      type: 'dateTime',
      required: false
    },
    birthPlace: {
      type: 'string',
      required: false,
      maxLength: 150,
      example: 'Gentilly, Quebec, Canada'
    },
    biography: {
      type: 'string',
      required: false,
      maxLength: 10000
    }
  },
  relations: {
    // Read with the movie of each credit: the filmography
    credits: {
      model: 'Credit',
      type: 'oneToMany',
      mappedBy: 'person',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'single',
        count: true,
        include: {
          movie: {
            type: 'always'
          }
        }
      }
    }
  },
  files: {
    photo: {
      mimeType: 'image/(jpeg|png|webp)',
      namePattern: 'people/{resourceId}-{hash}.{extension}',
      maxSize: '5 MB',
      image: {
        quality: 80,
        maxWidth: 600,
        maxHeight: 900
      }
    }
  },
  virtual: {
    age: {
      type: 'int',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'single',
        value: (person: {
          birthDate?: Date | string | null;
          deathDate?: Date | string | null;
        }) => ageOf(person.birthDate, person.deathDate)
      }
    }
  },
  index: ['name']
});

/** Age in whole years, at death for a person who has died. */
function ageOf(
  birthDate?: Date | string | null,
  deathDate?: Date | string | null
): number | null {
  if (!birthDate) {
    return null;
  }

  const birth = new Date(birthDate);
  const until = deathDate ? new Date(deathDate) : new Date();
  let age = until.getUTCFullYear() - birth.getUTCFullYear();
  const birthday = new Date(birth);
  birthday.setUTCFullYear(until.getUTCFullYear());
  if (birthday > until) {
    age--;
  }

  return age;
}
