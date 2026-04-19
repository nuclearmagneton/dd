const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

let _pendingClearKeys = null;
let _pendingWidevineUri = null;

function parseDrm(media) {
  _pendingClearKeys = null;
  _pendingWidevineUri = null;
  try {
    const cd = media.customData || {};
    const item = cd.mediaItem || cd.exoPlayerMediaItem;
    if (!item?.drmConfiguration) return;
    const drm = item.drmConfiguration;
    const uuid = (drm.uuid || "").toLowerCase();
    if (uuid.includes("e2719d58")) {
      _pendingClearKeys = extractKeys(drm.licenseUri);
    } else if (uuid.includes("edef8ba9")) {
      _pendingWidevineUri = drm.licenseUri || null;
    }
  } catch (_) {}
}

function extractKeys(licenseUri) {
  if (!licenseUri) return null;
  try {
    if (/^[0-9a-f]{32}:[0-9a-f]{32}$/i.test(licenseUri)) {
      const [kid, key] = licenseUri.split(":");
      return { [kid.toLowerCase()]: key.toLowerCase() };
    }
    if (licenseUri.startsWith("clearkey://")) {
      const data = JSON.parse(
        atob(licenseUri.slice(11).replace(/-/g, "+").replace(/_/g, "/")),
      );
      return keysFromJwkSet(data);
    }
    const json = JSON.parse(licenseUri);
    if (json.keys) return keysFromJwkSet(json);
  } catch (_) {}
  return null;
}

function keysFromJwkSet(data) {
  const keys = {};
  for (const k of data.keys || []) keys[b64urlToHex(k.kid)] = b64urlToHex(k.k);
  return Object.keys(keys).length ? keys : null;
}

function b64urlToHex(b64) {
  const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  return Array.from(bin, (c) =>
    c.charCodeAt(0).toString(16).padStart(2, "0"),
  ).join("");
}

playerManager.setMessageInterceptor(
  cast.framework.messages.MessageType.LOAD,
  (req) => {
    parseDrm(req.media);
    return req;
  },
);

playerManager.setMediaPlaybackInfoHandler((loadRequestData, playbackConfig) => {
  if (_pendingClearKeys) {
    playbackConfig.shakaConfig = {
      drm: { clearKeys: _pendingClearKeys },
    };
  } else if (_pendingWidevineUri) {
    playbackConfig.shakaConfig = {
      drm: {
        servers: { "com.widevine.alpha": _pendingWidevineUri },
      },
    };
  }
  return playbackConfig;
});

context.start(new cast.framework.CastReceiverOptions());
