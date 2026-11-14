import { defineErrors } from '@appweaver/common';

/** The error codes of the fleet, returned as the `code` of its error responses. */
export const FleetErrors = defineErrors({
  AlertAlreadyAcknowledged: {
    status: 409,
    title: 'Alert already acknowledged'
  },
  VehicleNotTracked: { status: 409, title: 'Vehicle not tracked yet' }
});
