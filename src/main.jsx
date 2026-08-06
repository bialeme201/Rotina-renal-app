import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import "./storage.js";
import "./index.css";
import App from "./App.jsx";

// O service worker faz precache de tudo, então um deploy novo só aparecia no
// acesso seguinte: ele assume na hora (skipWaiting + clients.claim), mas a
// página já tinha carregado os arquivos antigos. Aqui recarregamos quando a
// troca acontece. Na primeira visita não há controlador anterior — nesse caso
// a troca é a instalação inicial e não deve recarregar nada.
if ("serviceWorker" in navigator) {
  const tinhaControlador = Boolean(navigator.serviceWorker.controller);
  let recarregando = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!tinhaControlador || recarregando) return;
    recarregando = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>
);
