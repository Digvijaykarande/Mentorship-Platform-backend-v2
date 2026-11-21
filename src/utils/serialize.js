/** Small helpers shared by every serializer. All of them accept lean objects or Mongoose docs. */

export const idOf = (value) => {
  if (value === null || value === undefined) return null;
  return String(value._id ?? value.id ?? value);
};

export const iso = (date) => (date ? new Date(date).toISOString() : null);

/** Compact public view of a user (what other people are allowed to see). */
export const personOf = (user) => {
  if (!user) return null;
  if (!user._id && !user.name) return { id: idOf(user) }; // reference that was not populated
  return {
    id: idOf(user),
    name: user.name,
    code: user.code,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatar?.url ?? null,
  };
};

export const refOf = (doc, fields = ["name"]) => {
  if (!doc) return null;
  if (!doc._id && !doc.name && !doc.title) return { id: idOf(doc) };
  return { id: idOf(doc), ...Object.fromEntries(fields.map((f) => [f, doc[f]])) };
};
