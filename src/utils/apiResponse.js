/** Consistent success envelope: { success: true, message?, data, meta? } */
export const ok = (res, data = null, { message, meta, status = 200 } = {}) =>
  res
    .status(status)
    .json({ success: true, ...(message && { message }), data, ...(meta && { meta }) });

export const created = (res, data = null, opts = {}) => ok(res, data, { ...opts, status: 201 });

export const noContent = (res) => res.status(204).end();

/** Standard pagination meta, matches what the list endpoints will return. */
export const pageMeta = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});
