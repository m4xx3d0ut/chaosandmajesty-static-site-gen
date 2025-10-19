function main() {
  console.log('Static site generator initialized');
}
if (require.main === module) {
  main();
}
module.exports = { main };