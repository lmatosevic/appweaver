const { createTask } = require('@appweaver/core');

module.exports = createTask({
  description: 'Greets someone.',
  arguments: {
    name: { description: 'Who to greet.', required: true },
    times: { type: 'number', default: 1 }
  },
  options: {
    loud: { type: 'boolean' },
    greeting: { choices: ['hello', 'hi'], default: 'hello' }
  },
  run: ({ args, options }) => {
    const text = `${options.greeting} ${args.name}`;
    console.log((options.loud ? text.toUpperCase() : text).repeat(args.times));
    return args.times;
  }
});
