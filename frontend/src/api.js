import axios from "axios";

//const api = axios.create({
//  baseURL: "http://localhost:8000/api",
//});

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api";

const api = axios.create({
  baseURL: API_BASE,
});

export const listBooks = () => api.get("/books").then((r) => r.data);

export const getChapterWords = (chapterId) =>
  api.get(`/chapters/${chapterId}/words`).then((r) => r.data);

export const getWordsForReview = (limit = 20) =>
  api.get("/words/review", { params: { limit } }).then((r) => r.data);

export const recordReview = (wordId, correct, overrideDays = null) => {
  const body = { correct };
  if (overrideDays !== null) body.override_days = overrideDays;
  return api.post(`/words/${wordId}/review`, body).then((r) => r.data);
};

export const uploadPdf = (file, book, chapter, pages = 10) => {
  const form = new FormData();
  form.append("file", file);
  form.append("book", book);
  form.append("chapter", chapter);
  form.append("pages", pages);
  return api
    .post("/upload", form, { headers: { "Content-Type": "multipart/form-data" } })
    .then((r) => r.data);
};

export const getChapterSummary = (chapterId) =>
  api.get(`/chapters/${chapterId}`).then((r) => r.data);

export const getChapterWordsFiltered = (chapterId, pos) => {
  const params = pos ? { pos } : {};
  return api.get(`/chapters/${chapterId}/words`, { params }).then((r) => r.data);
};

export default api;

export const logArticleAttempt = (wordId, chapterId, correct) =>
  api.post("/article-attempts", {
    word_id: wordId,
    chapter_id: chapterId,
    correct,
  }).then((r) => r.data);

export const getGraph = (scope, id = null) => {
  const params = { scope };
  if (id !== null) params.id = id;
  return api.get("/graph", { params }).then((r) => r.data);
};

export const checkSentence = (wordId, sentence) =>
  api.post("/sentences/check", { word_id: wordId, sentence }).then((r) => r.data);

export const getSentencePrompts = (wordId, level) =>
  api.get(`/words/${wordId}/prompts`, { params: { level } }).then((r) => r.data);

export const listSentences = (wordId) =>
  api.get(`/words/${wordId}/sentences`).then((r) => r.data);