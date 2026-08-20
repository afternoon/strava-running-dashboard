// Refresh the dashboard when the app comes back to the foreground.
//
// The dashboard is server-rendered, so an iOS home-screen web app keeps
// showing whatever HTML it was frozen with — it can be days stale by the time
// it is reopened. Rather than reloading (which flashes a blank page and loses
// scroll position), fetch the page again and swap the body in place.

(function () {
  "use strict";

  // Don't re-fetch on quick app switches; the data only changes when a run is
  // uploaded, so anything fresher than this is not worth a round trip.
  var MIN_INTERVAL_MS = 10 * 1000;

  // The script runs as the page is rendered, so this is when the data we're
  // currently showing was produced. On a back/forward cache restore the script
  // does not run again, which is exactly right: the value stays old and the
  // restored page is treated as stale.
  var lastRefreshed = Date.now();
  var inFlight = false;

  function applyBody(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc.body || !doc.body.childNodes.length) return;

    // The page can come back as the "connect your Strava account" page if the
    // token was revoked, so carry over the body class and title too.
    document.body.className = doc.body.className;
    document.body.replaceChildren.apply(
      document.body,
      Array.prototype.slice.call(doc.body.childNodes)
    );
    if (doc.title) document.title = doc.title;
  }

  function refresh() {
    if (inFlight) return;
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastRefreshed < MIN_INTERVAL_MS) return;

    inFlight = true;
    fetch(location.href, { cache: "no-store", credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("refresh failed: " + res.status);
        return res.text();
      })
      .then(function (html) {
        applyBody(html);
        lastRefreshed = Date.now();
      })
      .catch(function () {
        // Offline or the worker is down — keep showing the stale dashboard and
        // try again the next time the app is opened.
      })
      .finally(function () {
        inFlight = false;
      });
  }

  document.addEventListener("visibilitychange", refresh);
  // iOS can restore a home-screen web app straight from the back/forward
  // cache, which does not always come with a visibilitychange.
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) refresh();
  });
})();
