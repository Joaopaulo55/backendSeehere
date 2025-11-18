import express from "express";
import megaService from "../services/megaService.js";

const router = express.Router();

// Teste rápido
router.get("/health", async (req, res) => {
  const health = await megaService.healthCheck();
  res.json(health);
});

// Forçar conexão
router.get("/connect", async (req, res) => {
  try {
    const data = await megaService.connect();
    res.json({ success: true, method: data.method });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar vídeos
router.get("/videos", async (req, res) => {
  try {
    const folder = req.query.folder || "";
    const videos = await megaService.listVideosInFolder(folder);
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Status rápido
router.get("/status", (req, res) => {
  res.json(megaService.getStatus());
});

// Informações do armazenamento
router.get("/storage", async (req, res) => {
  try {
    const info = await megaService.getStorageInfo();
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;


