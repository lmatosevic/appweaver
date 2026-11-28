import { linkModels, resetContext } from '@appweaver/testing';
import { createModel } from '../../../factory/create-model';
import {
  hideRestrictedRelations,
  restrictInclusions
} from '../../../resource/utils/inclusion-util';

describe('inclusion-util', () => {
  const restrictionsByModel: Record<string, Record<string, any>> = {
    User: { active: true },
    Tag: { visible: true },
    Team: { members: { some: { id: 1 } } }
  };
  const restrictionsOf = async (model: string) => restrictionsByModel[model];

  beforeEach(() => {
    resetContext();
    createModel({
      name: 'Team',
      scalars: { name: { type: 'string' } }
    });
    createModel({
      name: 'User',
      scalars: { active: { type: 'boolean' } },
      relations: { team: { model: 'Team', type: 'manyToOne', required: false } }
    });
    createModel({
      name: 'Tag',
      scalars: { visible: { type: 'boolean' } }
    });
    createModel({
      name: 'Note',
      scalars: { text: { type: 'string' } }
    });
    createModel({
      name: 'Post',
      scalars: { title: { type: 'string' } },
      relations: {
        author: { model: 'User', type: 'manyToOne', required: false },
        tags: { model: 'Tag', type: 'manyToMany' },
        notes: { model: 'Note', type: 'manyToMany' }
      }
    });
    linkModels();
  });

  afterAll(() => {
    resetContext();
  });

  describe('restrictInclusions', () => {
    test('filters the list relations and their counts by the restrictions of the related models', async () => {
      const { include, restrictions } = await restrictInclusions(
        {
          author: { include: { team: true } },
          tags: { where: { deletedAt: null } },
          notes: true,
          _count: { select: { tags: true, notes: true } }
        },
        'Post',
        restrictionsOf
      );

      expect(include).toEqual({
        author: { include: { team: true } },
        tags: { where: { AND: [{ deletedAt: null }, { visible: true }] } },
        notes: true,
        _count: { select: { tags: { where: { visible: true } }, notes: true } }
      });
      expect([...restrictions.keys()].sort()).toEqual(['Tag', 'Team', 'User']);
    });

    test('reads the restrictions of a model once', async () => {
      const spy = jest.fn(restrictionsOf);

      await restrictInclusions(
        { tags: true, _count: { select: { tags: true } } },
        'Post',
        spy
      );

      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('leaves a clause without restrictions as it is', async () => {
      const { include, restrictions } = await restrictInclusions(
        { notes: true, tags: true },
        'Post',
        async () => ({})
      );

      expect(include).toEqual({ notes: true, tags: true });
      expect(restrictions.size).toBe(0);
    });
  });

  describe('hideRestrictedRelations', () => {
    test('clears the single relations the restrictions hide, matched in memory or by the database', async () => {
      const { restrictions } = await restrictInclusions(
        { author: { include: { team: true } }, tags: true },
        'Post',
        restrictionsOf
      );
      const shared = { id: 5, active: true, team: { id: 9, name: 'A' } };
      const records = [
        { id: 1, author: { id: 4, active: false, team: null }, tags: [] },
        { id: 2, author: shared, tags: [] },
        { id: 3, author: { ...shared, team: { id: 8, name: 'B' } }, tags: [] }
      ];
      const matchingIds = jest.fn(async () => [{ id: 9 }]);

      const visible = await hideRestrictedRelations(
        records,
        'Post',
        restrictions,
        matchingIds
      );

      expect(visible[0].author).toBeNull();
      expect(visible[1].author).toBe(shared);
      expect(visible[2].author).toEqual({ ...shared, team: null });
      expect(matchingIds).toHaveBeenCalledTimes(1);
      expect(matchingIds).toHaveBeenCalledWith('team', {
        AND: [{ id: { in: [9, 8] } }, restrictionsByModel.Team]
      });
      // The records read are left as they were
      expect(records[0].author).not.toBeNull();
      expect(records[2].author.team).not.toBeNull();
    });

    test('returns the records as they are without restrictions', async () => {
      const records = [{ id: 1, author: { id: 4, active: false } }];

      await expect(
        hideRestrictedRelations(records, 'Post', new Map(), jest.fn())
      ).resolves.toBe(records);
    });
  });
});
