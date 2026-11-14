import { Type } from '@sinclair/typebox';
import { ApplicationError, ErrorCode } from '@appweaver/common';
import { currentAuthUser, injectService } from '@appweaver/core';
import { errorResponses, registerRoute } from '@appweaver/web';
import { FleetErrors } from '@/errors';
import { Role } from '@/features/access/roles';

registerRoute(
  (router) => {
    router.post(
      '/alerts/:id/acknowledge',
      {
        schema: {
          tags: ['Alerts'],
          summary: 'Acknowledge an alert',
          description:
            'Marks the alert as handled by the signed in dispatcher, closing it.',
          params: Type.Object({ id: Type.Integer() }),
          response: {
            200: Type.Ref('AlertSingle'),
            ...errorResponses(
              ErrorCode.ResourceNotFound,
              FleetErrors.AlertAlreadyAcknowledged
            )
          }
        }
      },
      async (req) => {
        const alerts = injectService('Alert');
        // Conditional, so two dispatchers never both acknowledge it
        const { count } = await alerts.client.updateMany({
          where: { id: req.params.id, acknowledgedAt: null },
          data: {
            acknowledgedAt: new Date(),
            acknowledgedById: currentAuthUser()!.id as number
          }
        });
        const alert = await alerts.find(req.params.id);
        if (count === 0) {
          throw new ApplicationError(
            FleetErrors.AlertAlreadyAcknowledged,
            'The alert was already acknowledged',
            { alertId: alert.id }
          );
        }
        return alert;
      }
    );
  },
  { roles: [Role.Dispatcher, Role.Admin] }
);
