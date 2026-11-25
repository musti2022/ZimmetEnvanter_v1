// Async route işleyicilerinin reddettiği promise'leri Express hata zincirine aktarır.
const asyncSar = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

module.exports = { asyncSar }
