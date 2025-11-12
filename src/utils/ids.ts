const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

export const createId = (length = 12): string => {
  let result = "";
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(Math.random() * alphabet.length);
    result += alphabet[index];
  }
  return result;
};
