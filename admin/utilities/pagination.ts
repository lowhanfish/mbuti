/** Nomor urut baris pada tabel berhalaman (halaman dimulai dari 1). */
export const listindex = (limit: number, pageSelect: number, index: number) => {
  return (pageSelect - 1) * limit + index + 1;
};

/** Ubah nomor halaman (mulai 1) menjadi nilai skip untuk backend. */
export const toSkip = (page: number, limit: number) => Math.max(0, (page - 1) * limit);
