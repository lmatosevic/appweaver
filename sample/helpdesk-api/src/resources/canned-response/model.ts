import { createModel } from '@appweaver/core';

/** A reusable reply, shared by a team or by everyone. */
export default createModel({
  name: 'CannedResponse',
  scalars: {
    title: {
      type: 'string',
      minLength: 2,
      maxLength: 100,
      example: 'Password reset steps'
    },
    body: {
      type: 'string',
      minLength: 1,
      maxLength: 5000
    }
  },
  relations: {
    // Shared with everyone when empty
    team: {
      model: 'Team',
      type: 'oneToMany',
      mappedBy: 'cannedResponses',
      owner: true,
      required: false,
      output: {
        type: 'always'
      }
    }
  }
});
