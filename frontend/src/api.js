import axios from "axios";

//const api = axios.create({
//  baseURL: "http://localhost:8000/api",
//});

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api";
const TOKEN_KEY = "auth_token";

const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Only clear+reload when we HAD a token and it got rejected (expired/invalid) —
// not for a never-logged-in visitor, or every 401 on a gated page would loop
// (clear does nothing, reload, same request, same 401, forever).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      error.config?.url !== "/auth/login" &&
      localStorage.getItem(TOKEN_KEY)
    ) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export const getAuthStatus = () => api.get("/auth/status").then((r) => r.data);

export const login = (password) =>
  api.post("/auth/login", { password }).then((r) => r.data);

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY);
export const storeToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearStoredToken = () => localStorage.removeItem(TOKEN_KEY);

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

export const lookupWord = (q) =>
  api.get("/lookup", { params: { q } }).then((r) => r.data);

export const getSentencePrompts = (wordId, level) =>
  api.get(`/words/${wordId}/prompts`, { params: { level } }).then((r) => r.data);

export const listSentences = (wordId) =>
  api.get(`/words/${wordId}/sentences`).then((r) => r.data);

export const listGrammarTopics = () =>
  api.get("/grammar/topics").then((r) => r.data);

export const createGrammarTopic = (title) =>
  api.post("/grammar/topics", { title }).then((r) => r.data);

export const addWordToChapter = (chapterId, word) =>
  api.post(`/chapters/${chapterId}/words`, word).then((r) => r.data);

export const addWordsToChapterBulk = (chapterId, items) =>
  api.post(`/chapters/${chapterId}/words/bulk`, { items }).then((r) => r.data);

export const removeWordFromChapter = (chapterId, wordId) =>
  api.delete(`/chapters/${chapterId}/words/${wordId}`).then((r) => r.data);