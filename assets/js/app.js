(() => {
  "use strict";
  const cfg = window.JORGITO_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_PUBLIC_KEY &&
    !cfg.SUPABASE_URL.includes("PEGA_AQUI") && !cfg.SUPABASE_PUBLIC_KEY.includes("PEGA_AQUI");
  const $ = (id) => document.getElementById(id);
  const show = (el, yes = true) => el?.classList.toggle("hidden", !yes);
  const msg = (id, text, kind = "") => { const el = $(id); if (el) { el.textContent = text; el.className = `message ${kind}`; } };
  let supabase = null;
  let currentUser = null;
  let isOwner = false;

  if (!configured || !window.supabase) {
    show($("setup-warning"));
    $("setup-warning").querySelector("p").textContent =
      "Abre assets/js/config.js y configura SUPABASE_URL y SUPABASE_PUBLIC_KEY con los datos de tu proyecto. No uses claves secretas ni service_role.";
    show($("login-view"), false);
    return;
  }

  supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLIC_KEY);

  async function getProfile(user) {
    const { data, error } = await supabase.from("profiles").select("display_name, role").eq("id", user.id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Tu perfil todavía no está listo. Cierra sesión e inténtalo de nuevo en unos segundos.");
    return data;
  }

  async function enter(user) {
    currentUser = user;
    const profile = await getProfile(user);
    isOwner = profile.role === "owner";
    $("user-label").textContent = profile.display_name || user.email;
    show($("login-view"), false);
    show($("app-view"));
    show($("logout-btn"));
    show($("admin-tab"), isOwner);
    // Interfaz por rol: los miembros ven solo las secciones de uso diario.
    document.querySelectorAll(".owner-only").forEach((el) => show(el, isOwner));
    await refreshAll();
  }

  async function refreshAll() {
    await Promise.all([loadRanking(), loadMyProposals(), loadGallery(), loadCharacterProfiles()]);
    if (isOwner) await Promise.all([loadAdminProposals(), loadPublishedContent()]);
  }

  async function loadRanking() {
    const root = $("ranking-list");
    root.innerHTML = '<p class="muted">Cargando ranking…</p>';
    const { data, error } = await supabase.from("leaderboard").select("user_id, display_name, points").order("points", { ascending: false }).limit(100);
    if (error) { root.textContent = "No se pudo cargar el ranking: " + error.message; return; }
    root.replaceChildren();
    let mine = 0;
    if (!data?.length) { root.innerHTML = '<div class="empty-state">Todavía no hay puntos. ¡Estrena el ranking!</div>'; }
    (data || []).forEach((row, index) => {
      if (row.user_id === currentUser.id) mine = Number(row.points) || 0;
      const item = document.createElement("article");
      item.className = "rank-row" + (row.user_id === currentUser.id ? " rank-me" : "");
      const position = document.createElement("span"); position.className = "rank-position"; position.textContent = ["🥇", "🥈", "🥉"][index] || String(index + 1);
      const name = document.createElement("strong"); name.textContent = row.display_name || "Jugador";
      const points = document.createElement("span"); points.className = "rank-points"; points.textContent = `${Number(row.points) || 0} pts`;
      item.append(position, name, points); root.append(item);
    });
    $("my-score").textContent = mine;
  }

  async function loadMyProposals() {
    const root = $("my-proposals");
    const { data, error } = await supabase.from("proposals").select("id, kind, title, body, status, created_at, character_name").eq("author_id", currentUser.id).order("created_at", { ascending: false }).limit(50);
    if (error) { root.textContent = "No se pudieron cargar tus propuestas."; return; }
    renderProposals(root, data || [], false);
  }

  async function loadAdminProposals() {
    const root = $("admin-proposals");
    const { data, error } = await supabase.from("proposals").select("id, kind, title, body, status, created_at, author_id, character_name").eq("status", "pending").order("created_at", { ascending: true }).limit(100);
    if (error) { root.textContent = "No se pudieron cargar las propuestas pendientes: " + error.message; return; }
    renderProposals(root, data || [], true);
  }

  function renderProposals(root, rows, admin) {
    root.replaceChildren();
    if (!rows.length) { root.innerHTML = '<div class="empty-state">No hay propuestas para mostrar.</div>'; return; }
    rows.forEach((p) => {
      const card = document.createElement("article"); card.className = "panel proposal-card";
      const title = document.createElement("h3"); title.textContent = p.title;
      const meta = document.createElement("p"); meta.className = "muted small"; meta.textContent = `${p.kind} · Personaje: ${p.character_name || "Sin personaje"} · ${p.status}`;
      const body = document.createElement("p"); body.textContent = p.body;
      card.append(title, meta, body);
      if (admin) {
        const actions = document.createElement("div"); actions.className = "inline-actions";
        const accept = document.createElement("button"); accept.className = "button button-primary"; accept.textContent = "Aprobar y publicar";
        accept.addEventListener("click", () => approveProposal(p));
        const reject = document.createElement("button"); reject.className = "button button-secondary"; reject.textContent = "Rechazar";
        reject.addEventListener("click", () => setProposalStatus(p.id, "rejected"));
        actions.append(accept, reject); card.append(actions);
      }
      root.append(card);
    });
  }

  async function approveProposal(p) {
    const { error: insertError } = await supabase.from("content_items").insert({ kind: p.kind, title: p.title, body: p.body, character_name: p.character_name, created_by: currentUser.id, published: true });
    if (insertError) { alert("No se pudo publicar: " + insertError.message); return; }
    await setProposalStatus(p.id, "approved");
    await loadPublishedContent();
  }

  async function setProposalStatus(id, status) {
    const { error } = await supabase.from("proposals").update({ status }).eq("id", id);
    if (error) { alert("No se pudo actualizar la propuesta: " + error.message); return; }
    await loadAdminProposals(); await loadMyProposals();
  }

  async function loadPublishedContent() {
    const root = $("published-content");
    const { data, error } = await supabase.from("content_items").select("id, kind, title, body, published, character_name").order("created_at", { ascending: false }).limit(100);
    if (error) { root.textContent = "No se pudo cargar el contenido."; return; }
    root.replaceChildren();
    if (!data?.length) { root.innerHTML = '<div class="empty-state">Aún no has publicado contenido.</div>'; return; }
    data.forEach((item) => {
      const card = document.createElement("article"); card.className = "panel proposal-card";
      const title = document.createElement("h3"); title.textContent = item.title;
      const body = document.createElement("p");
      let profileData = null;
      if (item.kind === "personaje") { try { profileData = JSON.parse(item.body || "{}"); } catch (_) {} }
      body.textContent = profileData && typeof profileData === "object"
        ? `${profileData.nickname || ""}${profileData.role ? " · " + profileData.role : ""}${profileData.description ? " — " + profileData.description : ""}`
        : item.body;
      const imageUrl = profileData?.image || ((["imagen", "sticker"].includes(item.kind) && /^https?:\/\//i.test((item.body || "").trim())) ? item.body.trim() : "");
      if (imageUrl) {
        const preview = document.createElement("img"); preview.className = "admin-image-preview"; preview.src = imageUrl; preview.alt = item.title; preview.loading = "lazy"; card.append(preview);
      }
      const meta = document.createElement("p"); meta.className = "muted small"; meta.textContent = `${item.kind} · Personaje: ${item.character_name || "Sin personaje"}`;
      const remove = document.createElement("button"); remove.className = "button button-quiet"; remove.textContent = "Eliminar";
      remove.addEventListener("click", async () => {
        if (!confirm(`¿Eliminar «${item.title}»?`)) return;
        const { error: delError } = await supabase.from("content_items").delete().eq("id", item.id);
        if (delError) alert(delError.message); else loadPublishedContent();
      });
      card.append(title, meta, body, remove); root.append(card);
    });
  }

  let galleryItems = [];
  function openGalleryLightbox(src, title) {
    let modal = document.getElementById("gallery-lightbox");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "gallery-lightbox";
      modal.className = "gallery-lightbox";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-label", "Vista ampliada de imagen");
      modal.innerHTML = `<button type="button" class="gallery-lightbox-close" aria-label="Cerrar imagen">×</button><div class="gallery-lightbox-content"><img alt=""><p class="gallery-lightbox-title"></p></div>`;
      document.body.append(modal);
      modal.addEventListener("click", (event) => { if (event.target === modal || event.target.closest(".gallery-lightbox-close")) closeGalleryLightbox(); });
      document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeGalleryLightbox(); });
    }
    const image = modal.querySelector("img");
    image.src = src;
    image.alt = title || "Imagen ampliada";
    modal.querySelector(".gallery-lightbox-title").textContent = title || "";
    modal.classList.add("is-open");
    document.body.classList.add("gallery-lightbox-open");
    modal.querySelector(".gallery-lightbox-close").focus();
  }
  function closeGalleryLightbox() {
    const modal = document.getElementById("gallery-lightbox");
    if (!modal) return;
    modal.classList.remove("is-open");
    document.body.classList.remove("gallery-lightbox-open");
  }
  function renderGalleryItems() {
    const root = $("gallery-grid");
    if (!root) return;
    root.replaceChildren();
    const filter = $("gallery-filter")?.value || "all";
    const items = galleryItems.filter(item => filter === "all" || item.character_name === filter);
    if (!items.length) { root.innerHTML = `<div class="empty-state">${filter !== "all" ? `Todavía no hay contenido asociado a ${filter}.` : "Todavía no hay contenido publicado para los personajes."}</div>`; return; }
    items.forEach((item) => {
      const card = document.createElement("article"); card.className = "panel gallery-card";
      const media = document.createElement("button"); media.type = "button"; media.className = "gallery-media"; media.setAttribute("aria-label", `Ampliar imagen: ${item.title}`);
      const img = document.createElement("img"); img.src = item.body.trim(); img.alt = item.title; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => { media.replaceChildren(); const fallback = document.createElement("span"); fallback.textContent = "No se pudo cargar la imagen. Revisa el archivo o enlace."; media.append(fallback); });
      media.addEventListener("click", () => openGalleryLightbox(item.body.trim(), item.title));
      media.append(img);
      const caption = document.createElement("div"); caption.className = "gallery-caption";
      const title = document.createElement("h3"); title.textContent = item.title;
      const type = document.createElement("span"); type.className = "gallery-type"; type.textContent = item.kind === "sticker" ? "STICKER" : "MEME / IMAGEN";
      caption.append(title, type); card.append(media, caption); root.append(card);
    });
  }

  async function loadGallery() {
    const root = $("gallery-grid");
    if (!root) return;
    root.textContent = "Cargando galería…";
    const { data, error } = await supabase.from("content_items").select("id, kind, title, body, published, character_name").eq("published", true).in("kind", ["imagen", "sticker"]).order("created_at", { ascending: false }).limit(100);
    if (error) { root.textContent = "No se pudo cargar la galería. Revisa las políticas de lectura de content_items en Supabase."; return; }
    galleryItems = (data || []).filter(item => typeof item.body === "string" && /^https?:\/\//i.test(item.body.trim()));
    renderGalleryItems();
  }
  $("gallery-filter")?.addEventListener("change", renderGalleryItems);

  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault(); msg("login-message", "Verificando acceso…");
    const email = $("email").value.trim();
    const password = $("password").value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { msg("login-message", "No se pudo iniciar sesión. Verifica tus datos o solicita una invitación.", "error"); return; }
    try { await enter(data.user); } catch (e) { msg("login-message", e.message, "error"); }
  });

  $("logout-btn").addEventListener("click", async () => {
    await supabase.auth.signOut(); currentUser = null; isOwner = false;
    show($("app-view"), false); show($("login-view")); show($("logout-btn"), false);
    $("user-label").textContent = ""; $("login-form").reset();
  });

  $("refresh-ranking").addEventListener("click", loadRanking);
  $("refresh-gallery")?.addEventListener("click", loadGallery);
$("proposal-form").addEventListener("submit", async (event) => {
    event.preventDefault(); msg("proposal-message", "Enviando propuesta…");
    const { error } = await supabase.from("proposals").insert({
      author_id: currentUser.id, kind: $("proposal-type").value, character_name: $("proposal-character").value,
      title: $("proposal-title").value.trim(), body: $("proposal-body").value.trim()
    });
    if (error) { msg("proposal-message", "No se pudo enviar: " + error.message, "error"); return; }
    $("proposal-form").reset(); msg("proposal-message", "Propuesta enviada. Queda pendiente de revisión.", "success");
    await loadMyProposals();
  });

  $("content-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isOwner) { msg("content-message", "Solo el propietario puede publicar contenido.", "error"); return; }
    msg("content-message", "Preparando publicación…");
    const kind = $("content-type").value;
    const character_name = $("content-character").value;
    if (!character_name) { msg("content-message", "Selecciona el personaje al que pertenece este contenido.", "error"); return; }
    const title = $("content-title").value.trim();
    const file = $("content-image-file")?.files?.[0];
    let body = $("content-body").value.trim();

    if (["imagen", "sticker"].includes(kind) && file) {
      if (!file.type.startsWith("image/")) { msg("content-message", "Selecciona un archivo de imagen válido.", "error"); return; }
      if (file.size > 5 * 1024 * 1024) { msg("content-message", "La imagen supera el límite de 5 MB.", "error"); return; }
      msg("content-message", "Subiendo imagen a Supabase Storage…");
      const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
      const path = `${currentUser.id}/${Date.now()}-${safeName || "imagen"}`;
      const { data: uploaded, error: uploadError } = await supabase.storage.from("jorgito-gallery").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
      if (uploadError) { msg("content-message", "No se pudo subir la imagen. Verifica que hayas creado el bucket jorgito-gallery y sus políticas en Supabase. Detalle: " + uploadError.message, "error"); return; }
      body = supabase.storage.from("jorgito-gallery").getPublicUrl(uploaded.path).data.publicUrl;
    }

    if (!body) { msg("content-message", ["imagen", "sticker"].includes(kind) ? "Sube una imagen o pega un enlace público." : "Escribe el contenido antes de publicar.", "error"); return; }
    if (["imagen", "sticker"].includes(kind) && !/^https?:\/\//i.test(body)) { msg("content-message", "Para memes y stickers, usa una imagen subida o una URL pública que empiece por https:// o http://.", "error"); return; }
    const { error } = await supabase.from("content_items").insert({ kind, title, body, character_name, created_by: currentUser.id, published: true });
    if (error) { msg("content-message", "La imagen puede haberse subido, pero no se pudo publicar el contenido: " + error.message, "error"); return; }
    $("content-form").reset(); msg("content-message", "Contenido publicado.", "success"); await loadPublishedContent(); await loadGallery();
  });

  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
    if (tab.id === "admin-tab" && !isOwner) return;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".view-panel").forEach((panel) => show(panel, panel.id === tab.dataset.view));
    if (tab.dataset.view === "admin-panel" && isOwner) { loadAdminProposals(); loadPublishedContent(); }
    if (tab.dataset.view === "gallery-panel") loadGallery();
  }));


  // Personajes reales del grupo. Los datos guardados en Supabase prevalecen sobre estos valores iniciales.
  const starterCharacters = [
    { name: "Moncayo", nickname: "Carro Loco", emoji: "🤡", image: "assets/images-moncayo.png", audio: "assets/audio/Moncayo.mp3", role: "El rey de la recocha y del camuflaje laboral", description: "Convierte cualquier jornada en una operación para parecer ocupado mientras trama algo.", traits: ["Loco", "Hablador", "Chistoso"], quote: "Qué hpta pereza trabajar", anecdote: "Pendiente de que el grupo agregue la próxima historia memorable.", skill: "Camuflaje laboral: parecer ocupado mientras trama algo", weakness: "Trabajar de verdad", relationship: "Con Oscarito pasa del cariño a la guerra y de la guerra al cariño en tiempo récord.", chaos: 5 },
    { name: "Oscarito", nickname: "Jorgito / Quilcue", emoji: "😎", role: "El supernumerario que siempre tiene una versión oficial", description: "Resupernumerario, lamparoso, ojón y ordinario; cuando le preguntan por el cabildo de Totoró, activa el modo rueda de prensa y lo niega con toda seguridad.", traits: ["Lamparoso", "Ojón", "Ordinario"], quote: "Que ordena jefe", anecdote: "Le encanta quedarse con la pistola asignada durante las vacaciones: el trámite de entrega puede esperar a que vuelva el jefe.", skill: "Convertir una pregunta sencilla en una declaración oficial", weakness: "Que le recuerden entregar lo asignado antes de salir a vacaciones", relationship: "Con Moncayo: enemigos íntimos; pasan del amor al odio en un instante y luego vuelven a ser amigos como si nada.", chaos: 5 },
    { name: "Daniel", nickname: "Pan dulce", emoji: "🪖", role: "Comandante supremo de las operaciones que nadie pidió", description: "Jefe de fuerzas especiales: convierte una salida rutinaria en una misión de alto riesgo y luego pregunta quién autorizó el drama.", traits: ["Chayanne", "Pan dulce", "Comando Colanta"], quote: "Es Cauca, ¿no?", anecdote: "Mandó a los técnicos directo a la boca del lobo y luego seguramente lo llamó entrenamiento de campo.", skill: "Escalador de vidrios enjabonados", weakness: "Los caucanos", relationship: "", chaos: 5 }
  ];
  let characterProfiles = {};
  async function loadCharacterProfiles() {
    const { data, error } = await supabase.from("content_items").select("id, title, body, character_name, created_at").eq("kind", "personaje").eq("published", true).order("created_at", { ascending: false }).limit(100);
    if (error) { console.warn("No se pudieron cargar las fichas guardadas:", error.message); return; }
    characterProfiles = {};
    (data || []).forEach(row => {
      const name = row.character_name || row.title;
      if (!name || characterProfiles[name]) return;
      try {
        const parsed = JSON.parse(row.body || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) characterProfiles[name] = { ...parsed, name };
      } catch (_) { /* Los registros antiguos con texto plano no son fichas editables; se conserva la ficha inicial. */ }
    });
    renderCharacters();
    nextQuote();
    refreshWhatWouldCharacters();
    const selected = $("character-edit-select")?.value;
    if (selected) populateCharacterEditor(selected);
  }

  function populateCharacterEditor(name) {
    const person = characterProfiles[name] || starterCharacters.find(p => p.name === name);
    if (!person) return;
    const fields = { "character-edit-nickname": person.nickname, "character-edit-emoji": person.emoji, "character-edit-role": person.role, "character-edit-description": person.description, "character-edit-traits": (person.traits || []).join(", "), "character-edit-quote": person.quote, "character-edit-anecdote": person.anecdote, "character-edit-skill": person.skill, "character-edit-weakness": person.weakness, "character-edit-chaos": String(person.chaos || 3), "character-edit-audio": person.audio || "", "character-edit-relationship": person.relationship || "" };
    Object.entries(fields).forEach(([id, value]) => { if ($(id)) $(id).value = value || ""; });
    const preview = $("character-edit-image-preview");
    const image = person.image || "";
    if (preview) { preview.src = image; show(preview, Boolean(image)); preview.dataset.currentImage = image; }
    if ($("character-edit-image")) $("character-edit-image").value = "";
    msg("character-edit-message", "Ficha cargada. Edita los campos y guarda cuando termines.");
  }

  $("character-edit-select")?.addEventListener("change", event => populateCharacterEditor(event.target.value));
  $("character-edit-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!isOwner) { msg("character-edit-message", "Solo el propietario puede editar personajes.", "error"); return; }
    const name = $("character-edit-select").value;
    if (!name) { msg("character-edit-message", "Selecciona un personaje.", "error"); return; }
    const original = characterProfiles[name] || starterCharacters.find(p => p.name === name) || {};
    let image = $("character-edit-image-preview").dataset.currentImage || original.image || "";
    const file = $("character-edit-image").files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) { msg("character-edit-message", "Selecciona un archivo de imagen válido.", "error"); return; }
      if (file.size > 5 * 1024 * 1024) { msg("character-edit-message", "La imagen supera el límite de 5 MB.", "error"); return; }
      msg("character-edit-message", "Subiendo foto del personaje…");
      const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
      const path = `${currentUser.id}/characters/${Date.now()}-${safeName || "personaje"}`;
      const { data: uploaded, error: uploadError } = await supabase.storage.from("jorgito-gallery").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
      if (uploadError) { msg("character-edit-message", "No se pudo subir la foto: " + uploadError.message, "error"); return; }
      image = supabase.storage.from("jorgito-gallery").getPublicUrl(uploaded.path).data.publicUrl;
    }
    const profile = {
      name, nickname: $("character-edit-nickname").value.trim(), emoji: $("character-edit-emoji").value.trim() || "🎮",
      role: $("character-edit-role").value.trim(), description: $("character-edit-description").value.trim(),
      traits: $("character-edit-traits").value.split(",").map(x => x.trim()).filter(Boolean), quote: $("character-edit-quote").value.trim(),
      anecdote: $("character-edit-anecdote").value.trim(), skill: $("character-edit-skill").value.trim(), weakness: $("character-edit-weakness").value.trim(),
      chaos: Math.max(1, Math.min(5, Number($("character-edit-chaos").value) || 3)), audio: $("character-edit-audio").value.trim(), relationship: $("character-edit-relationship").value.trim(), image
    };
    if (!profile.nickname || !profile.role || !profile.description) { msg("character-edit-message", "Completa el apodo, el rol y la descripción.", "error"); return; }
    msg("character-edit-message", "Guardando ficha en Supabase…");
    const { data: existing, error: findError } = await supabase.from("content_items").select("id").eq("kind", "personaje").eq("character_name", name).eq("title", name).order("created_at", { ascending: false }).limit(1);
    if (findError) { msg("character-edit-message", "No se pudo consultar la ficha: " + findError.message, "error"); return; }
    const row = { kind: "personaje", title: name, body: JSON.stringify(profile), character_name: name, created_by: currentUser.id, published: true };
    let saveResult;
    if (existing?.length) saveResult = await supabase.from("content_items").update(row).eq("id", existing[0].id);
    else saveResult = await supabase.from("content_items").insert(row);
    if (saveResult.error) { msg("character-edit-message", "No se pudo guardar la ficha: " + saveResult.error.message, "error"); return; }
    characterProfiles[name] = profile;
    const starter = starterCharacters.find(p => p.name === name);
    if (starter) Object.assign(starter, profile);
    const preview = $("character-edit-image-preview"); if (preview) { preview.src = image; preview.dataset.currentImage = image; show(preview, Boolean(image)); }
    renderCharacters();
    msg("character-edit-message", "Ficha de " + name + " guardada correctamente.", "success");
    await loadPublishedContent();
  });

  function renderCharacters() {
    const root = $("characters-grid");
    if (!root) return;
    root.replaceChildren();
    starterCharacters.forEach((basePerson) => {
      const person = { ...basePerson, ...(characterProfiles[basePerson.name] || {}) };
      const card = document.createElement("article"); card.className = "panel character-card";
      const banner = document.createElement("div"); banner.className = "character-banner";
      const avatar = document.createElement("div"); avatar.className = "character-avatar";
      if (person.image) { const portrait = document.createElement("img"); portrait.src = person.image; portrait.alt = `Ilustración de ${person.name}`; portrait.loading = "lazy"; avatar.append(portrait); }
      else avatar.textContent = person.emoji;
      const heading = document.createElement("div");
      const name = document.createElement("h3"); name.className = "character-name"; name.textContent = person.name;
      const nickname = document.createElement("p"); nickname.className = "character-nickname"; nickname.textContent = `«${person.nickname}»`;
      heading.append(name, nickname); banner.append(avatar, heading);
      const details = document.createElement("div"); details.className = "character-details";
      const field = (label, value) => { const wrap = document.createElement("p"); const lab = document.createElement("span"); lab.className = "character-label"; lab.textContent = label; const val = document.createElement("span"); val.textContent = value; wrap.append(lab, val); return wrap; };
      details.append(field("Rol en el grupo", person.role), field("Descripción", person.description));
      const traits = document.createElement("div"); traits.className = "character-tags";
      person.traits.forEach(t => { const tag = document.createElement("span"); tag.className = "character-tag"; tag.textContent = t; traits.append(tag); });
      details.append(traits, field("Frase típica", person.quote));
      if (person.audio) {
        const audioWrap = document.createElement("div"); audioWrap.className = "character-audio";
        const audioLabel = document.createElement("p"); audioLabel.className = "character-label"; audioLabel.textContent = "Escucha su frase";
        const player = document.createElement("audio"); player.controls = true; player.preload = "none"; player.src = person.audio;
        player.setAttribute("aria-label", `Audio de la frase típica de ${person.name}`);
        audioWrap.append(audioLabel, player); details.append(audioWrap);
      } else {
        details.append(field("Audio de la frase", "Pendiente de agregar archivo MP3"));
      }
      details.append(field("Anécdota", person.anecdote), field("Habilidad especial", person.skill), field("Debilidad legendaria", person.weakness), field("Nivel de caos", `${person.chaos}/5`));
      if (person.relationship) details.append(field("Amigos y enemigos", person.relationship));
      {
        const galleryButton = document.createElement("button");
        galleryButton.type = "button";
        galleryButton.className = "button button-secondary character-gallery-button";
        galleryButton.textContent = `🖼️ Ver galería de ${person.name}`;
        galleryButton.addEventListener("click", () => {
          const tab = document.querySelector('.tab[data-view="gallery-panel"]');
          tab?.click();
          window.setTimeout(() => {
            const filter = $("gallery-filter");
            if (filter) {
              filter.value = person.name;
              filter.dispatchEvent(new Event("change"));
            }
          }, 100);
        });
        details.append(galleryButton);
      }
      card.append(banner, details); root.append(card);
    });
  }
  renderCharacters();
  const characterTemplate = "Nombre real o nombre para mostrar:\nApodo:\nRol en el grupo:\nDescripción corta:\nPersonalidad (3 rasgos):\nFrase típica (texto):\nArchivo de audio MP3 (ruta, por ejemplo assets/audio/jorgito-frase.mp3):\nAnécdota memorable:\nHabilidad especial:\nDebilidad legendaria:\nNivel de caos (1–5):\nEmoji o imagen (opcional):\nNombre del archivo MP3 (opcional):";
  $("copy-character-template")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(characterTemplate); msg("character-template-message", "Ficha copiada. Pégala en Administración → Personaje.", "success"); }
    catch { msg("character-template-message", "Selecciona y copia manualmente la ficha que aparece arriba.", "error"); }
  });

  // Minijuegos locales: ¿Quién es el personaje? Usa las fichas cargadas desde Supabase.
  function getGameCharacters() {
    return starterCharacters
      .filter(base => base.name !== "Jorgito")
      .map(base => ({ ...base, ...(characterProfiles[base.name] || {}) }))
      .filter(person => person.name && (person.quote || person.anecdote || person.skill || person.weakness || person.role || person.description));
  }

  function buildCharacterQuestions() {
    const people = getGameCharacters();
    if (people.length < 2) return [];
    const questions = [];
    people.forEach(person => {
      const clues = [
        person.quote && { prompt: `¿A quién pertenece esta frase típica: «${person.quote}»?`, answer: person.name },
        person.skill && { prompt: `¿Quién tiene esta habilidad especial: ${person.skill}?`, answer: person.name },
        person.weakness && { prompt: `¿Cuál personaje tiene esta debilidad legendaria: ${person.weakness}?`, answer: person.name },
        person.anecdote && { prompt: `¿De quién es esta anécdota: «${person.anecdote}»?`, answer: person.name },
        person.nickname && { prompt: `¿Quién lleva el apodo «${person.nickname}»?`, answer: person.name },
        person.role && { prompt: `¿Quién tiene este rol en el grupo: ${person.role}?`, answer: person.name },
        person.traits?.length && { prompt: `¿A quién describen estos rasgos: ${person.traits.join(", ")}?`, answer: person.name }
      ].filter(clue => clue && clue.prompt.trim().length > 0);
      questions.push(...clues);
    });
    return questions;
  }
  let currentQuote = null;
  function nextQuote() {
    const questions = buildCharacterQuestions();
    const root = $("quote-options");
    if (!questions.length) {
      $("quote-question").textContent = "Todavía no hay suficientes fichas de personajes para jugar. Guarda las fichas de Moncayo, Oscarito y Daniel en Supabase.";
      root?.replaceChildren();
      $("quote-feedback").textContent = "";
      return;
    }
    currentQuote = questions[Math.floor(Math.random() * questions.length)];
    const people = getGameCharacters();
    const wrongAnswers = people.filter(person => person.name !== currentQuote.answer).map(person => person.name);
    for (let i = wrongAnswers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [wrongAnswers[i], wrongAnswers[j]] = [wrongAnswers[j], wrongAnswers[i]];
    }
    const answers = [currentQuote.answer, ...wrongAnswers.slice(0, 2)];
    for (let i = answers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [answers[i], answers[j]] = [answers[j], answers[i]];
    }
    $("quote-question").textContent = currentQuote.prompt;
    root.replaceChildren();
    $("quote-feedback").textContent = "";
    answers.forEach(answer => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "button button-secondary"; b.textContent = answer;
      b.addEventListener("click", () => {
        [...root.querySelectorAll("button")].forEach(x => x.disabled = true);
        const correct = answer === currentQuote.answer;
        $("quote-feedback").textContent = correct
          ? "¡Correcto! Registrando 1 punto en el ranking…"
          : `¡No era ese! La respuesta correcta es ${currentQuote.answer}.`;
        $("quote-feedback").className = "message " + (correct ? "success" : "error");
        if (correct) {
          supabase.from("game_results").insert({
            user_id: currentUser.id,
            game_key: "quien-es-el-personaje",
            points: 1
          }).then(async ({ error }) => {
            if (error) {
              $("quote-feedback").textContent = "¡Respuesta correcta!, pero no se pudo guardar el punto. Revisa la configuración de Supabase.";
              $("quote-feedback").className = "message error";
              return;
            }
            $("quote-feedback").textContent = "¡Correcto! +1 punto guardado en el ranking.";
            $("quote-feedback").className = "message success";
            await loadRanking();
          });
        }
      });
      root.append(b);
    });
  }
  $("quote-next")?.addEventListener("click", nextQuote);
function refreshWhatWouldCharacters() {
    const select = $("what-would-character");
    if (!select) return;
    const previous = select.value;
    select.replaceChildren();
    const people = getGameCharacters();
    if (!people.length) {
      const option = document.createElement("option"); option.value = ""; option.textContent = "No hay fichas disponibles"; select.append(option); return;
    }
    const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = "Selecciona un personaje"; select.append(placeholder);
    people.forEach(person => { const option = document.createElement("option"); option.value = person.name; option.textContent = `${person.emoji || "🎭"} ${person.name}`; select.append(option); });
    if (people.some(person => person.name === previous)) select.value = previous;
  }
  $("what-would-generate")?.addEventListener("click", () => {
    const selectedName = $("what-would-character")?.value;
    const person = getGameCharacters().find(item => item.name === selectedName);
    const out = $("what-would-result");
    if (!person) { out.textContent = "Primero selecciona uno de los personajes del grupo."; return; }
    const situations = [
      `Le encargan una tarea sencilla. ${person.name} responde con su estilo de «${person.role || person.description || "personaje impredecible"}».`,
      `Hay una emergencia totalmente innecesaria. ${person.name} intenta resolverla usando ${person.skill || person.traits?.join(", ") || "su talento para el caos"}.`,
      `Le preguntan por su mayor punto débil. La respuesta de ${person.name}: «${person.weakness || "eso es información clasificada"}».`,
      `En plena reunión, ${person.name} suelta: «${person.quote || person.nickname || "tengo un plan"}». El grupo ya sabe que algo va a pasar.`,
      `Alguien pide que cuenten una historia del grupo. ${person.name} empieza por esta anécdota: ${person.anecdote || person.description || "una historia que nadie logra verificar"}.`
    ];
    out.textContent = situations[Math.floor(Math.random() * situations.length)];
  });
nextQuote();
  refreshWhatWouldCharacters();

  // Recuperación de contraseña: Supabase redirige aquí con tokens en el hash.
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const queryParams = new URLSearchParams(window.location.search);
  const authError = hashParams.get("error_description") || queryParams.get("error_description");
  const recoveryLinkPresent = hashParams.has("access_token") || hashParams.get("type") === "recovery";
  if (authError) {
    show($("login-view"), true);
    show($("recovery-view"), false);
    msg("login-message", "El enlace de recuperación expiró o ya fue utilizado. Solicita uno nuevo y ábrelo una sola vez.", "error");
  }

  let recoverySessionReady = false;
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "PASSWORD_RECOVERY" || (recoveryLinkPresent && session?.user)) {
      recoverySessionReady = true;
      show($("login-view"), false);
      show($("app-view"), false);
      show($("recovery-view"), true);
      msg("recovery-message", "Enlace válido. Puedes establecer tu nueva contraseña.", "success");
    } else if (event === "SIGNED_OUT" || !session) {
      currentUser = null;
    }
  });

  $("recovery-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = $("new-password").value;
    const confirmation = $("confirm-password").value;
    if (password.length < 8) { msg("recovery-message", "La contraseña debe tener al menos 8 caracteres.", "error"); return; }
    if (password !== confirmation) { msg("recovery-message", "Las contraseñas no coinciden.", "error"); return; }
    if (!recoverySessionReady) { msg("recovery-message", "El enlace no es válido o expiró. Solicita un correo de recuperación nuevo.", "error"); return; }
    msg("recovery-message", "Guardando nueva contraseña…");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { msg("recovery-message", "No se pudo cambiar la contraseña: " + error.message, "error"); return; }
    await supabase.auth.signOut();
    history.replaceState(null, "", window.location.pathname + window.location.search);
    $("recovery-form").reset();
    show($("recovery-view"), false); show($("login-view"), true);
    msg("login-message", "Contraseña actualizada. Ya puedes iniciar sesión con la nueva contraseña.", "success");
  });
  $("back-to-login").addEventListener("click", () => {
    show($("recovery-view"), false); show($("login-view"), true);
  });

  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (recoveryLinkPresent && session?.user) {
      recoverySessionReady = true;
      show($("login-view"), false); show($("recovery-view"), true);
    } else if (session?.user) {
      try { await enter(session.user); } catch (e) { msg("global-message", e.message, "error"); }
    }
  });
})();
