module.exports = async (args) =>
  args.map(Number).reduce((sum, value) => sum + value, 0);
