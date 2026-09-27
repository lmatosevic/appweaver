import { Type } from '@sinclair/typebox';
import { registerModel, registerRoute } from '@appweaver/core';
import db from '@db/client';
import { Permission } from '@/features/access/permissions';

registerModel(
  Type.Object(
    {
      total: Type.Integer(),
      byDepartment: Type.Array(
        Type.Object({
          department: Type.String({ example: 'Engineering' }),
          headcount: Type.Integer()
        })
      ),
      byEmploymentType: Type.Array(
        Type.Object({
          employmentType: Type.String({ example: 'FullTime' }),
          headcount: Type.Integer()
        })
      )
    },
    { $id: 'HeadcountReport' }
  )
);

registerRoute(
  (router) => {
    router.get(
      '/reports/headcount',
      {
        schema: {
          tags: ['Reports'],
          summary: 'Headcount of the active employees',
          description:
            'Grouped by department and by employment type. Terminated employees are left out.',
          response: {
            200: Type.Ref('HeadcountReport')
          }
        }
      },
      async () => {
        const where = {
          deletedAt: null,
          status: { not: 'Terminated' as const }
        };

        const [departments, byDepartment, byEmploymentType] = await Promise.all(
          [
            db.department.findMany({ select: { id: true, name: true } }),
            db.employee.groupBy({
              by: ['departmentId'],
              where,
              _count: { _all: true }
            }),
            db.employee.groupBy({
              by: ['employmentType'],
              where,
              _count: { _all: true }
            })
          ]
        );

        const names = new Map(departments.map((d) => [d.id, d.name]));

        return {
          total: byEmploymentType.reduce((sum, g) => sum + g._count._all, 0),
          byDepartment: byDepartment
            .map((group) => ({
              department:
                group.departmentId === null
                  ? 'Unassigned'
                  : (names.get(group.departmentId) ?? 'Unknown'),
              headcount: group._count._all
            }))
            .sort((a, b) => b.headcount - a.headcount),
          byEmploymentType: byEmploymentType.map((group) => ({
            employmentType: group.employmentType,
            headcount: group._count._all
          }))
        };
      }
    );
  },
  {
    permissions: [Permission.EmployeeManage],
    // Dropped whenever an employee changes
    cacheTTL: 60_000,
    cacheModelName: 'Employee'
  }
);
