function isSSEMessage(input) {
  return typeof input === "object" && input !== null;
}
export {
  isSSEMessage
};
