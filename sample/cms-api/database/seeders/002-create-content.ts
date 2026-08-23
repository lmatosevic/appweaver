import { config } from '@appweaver/common';
import { db } from '@db/client';

/** A category tree, the tags, two pages and the posts. */
export async function createSampleContent(): Promise<string> {
  const author = await db.user.findFirst({
    where: { email: config.SYSTEM_ADMIN_INITIAL_EMAIL }
  });

  const nature = await db.category.create({
    data: {
      name: 'Nature',
      slug: 'nature',
      description: 'Stories from the outdoors.',
      position: 1
    }
  });

  const wildlife = await db.category.create({
    data: {
      name: 'Wildlife',
      slug: 'wildlife',
      description: 'The animals living in it.',
      position: 1,
      parentId: nature.id
    }
  });

  const travel = await db.category.create({
    data: {
      name: 'Travel',
      slug: 'travel',
      description: 'Where to go and how to get there.',
      position: 2
    }
  });

  await db.category.create({
    data: {
      name: 'Trail guides',
      slug: 'trail-guides',
      position: 1,
      parentId: travel.id
    }
  });

  const tags = ['Hiking', 'Photography', 'Croatia'];
  for (const name of tags) {
    await db.tag.create({
      data: { name, slug: name.toLowerCase(), createdById: author?.id }
    });
  }

  await db.page.createMany({
    data: [
      {
        title: 'About us',
        slug: 'about-us',
        status: 'Published',
        publishedAt: new Date(),
        showInMenu: true,
        menuPosition: 1,
        seo: {
          title: 'About us',
          description: 'Who writes here and why.'
        },
        content: [
          '<h1>About us</h1>',
          '<p>We are a small editorial team writing about the outdoors, the',
          'animals living in it, and the trails that lead there.</p>',
          '<h2>How we work</h2>',
          '<ul>',
          '  <li>Every trail in a guide has been walked by one of us.</li>',
          '  <li>Photographs are our own unless credited otherwise.</li>',
          '  <li>Corrections are published with the date they were made.</li>',
          '</ul>'
        ].join('\n'),
        authorId: author?.id
      },
      {
        title: 'Contact',
        slug: 'contact',
        status: 'Published',
        publishedAt: new Date(),
        showInMenu: true,
        menuPosition: 2,
        content: [
          '<h1>Contact</h1>',
          '<p>Write to <a href="mailto:editors@example.com">editors@example.com</a>',
          'and we answer within a few days.</p>'
        ].join('\n'),
        authorId: author?.id
      }
    ]
  });

  await db.post.create({
    data: {
      title: 'Ten trails worth the walk',
      slug: 'ten-trails-worth-the-walk',
      excerpt: 'A season of walking, narrowed down to the ten we would repeat.',
      content: [
        '<p>We walked a lot this season. These ten are the ones we would',
        'happily walk again tomorrow.</p>',
        '<h2>1. The ridge above the bay</h2>',
        '<p>Three hours up, two back down, and the sea in sight the whole way.</p>'
      ].join('\n'),
      status: 'Published',
      publishedAt: new Date(),
      featured: true,
      categoryId: travel.id,
      authorId: author?.id,
      createdById: author?.id,
      tags: {
        connect: [{ slug: 'hiking' }, { slug: 'croatia' }]
      }
    }
  });

  await db.post.create({
    data: {
      title: 'Photographing deer at first light',
      slug: 'photographing-deer-at-first-light',
      excerpt:
        'What the hour before sunrise gives you that no other hour does.',
      content: [
        '<p>Deer move at dawn, and so should you. Everything else is patience',
        'and a long lens.</p>'
      ].join('\n'),
      status: 'Published',
      publishedAt: new Date(),
      categoryId: wildlife.id,
      authorId: author?.id,
      createdById: author?.id,
      tags: {
        connect: [{ slug: 'photography' }]
      }
    }
  });

  // Scheduled a day out for the publisher job
  await db.post.create({
    data: {
      title: 'A winter route along the river',
      slug: 'a-winter-route-along-the-river',
      excerpt: 'Flat, quiet, and open all winter.',
      content: '<p>The route stays walkable long after the ridges close.</p>',
      publishedAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      categoryId: nature.id,
      authorId: author?.id,
      createdById: author?.id,
      tags: {
        connect: [{ slug: 'hiking' }]
      }
    }
  });

  return 'Seeded 4 categories, 3 tags, 2 pages and 3 posts';
}
