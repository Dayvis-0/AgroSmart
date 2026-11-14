import { DEFAULT_PARCEL, MAPTILER_ATTRIBUTION, MAPTILER_KEY } from '../config.js';

export const LOCATE_EVENT = 'agrosmart:locate';

let map = null;
let marker = null;

function baseLayer(name, extension) {
  return L.tileLayer(
    `https://api.maptiler.com/maps/${name}/{z}/{x}/{y}.${extension}?key=${MAPTILER_KEY}`,
    { attribution: MAPTILER_ATTRIBUTION, maxZoom: 20, tileSize: 512, zoomOffset: -1 }
  );
}

function createLocateControl() {
  const control = L.control({ position: 'topleft' });
  control.onAdd = function onAdd() {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    const link = L.DomUtil.create('a', '', container);
    link.href = '#';
    link.title = 'Mostrar mi ubicación actual';
    link.role = 'button';
    link.setAttribute('aria-label', 'Mostrar mi ubicación actual');
    link.innerHTML = '🎯';
    link.style.cssText =
      'display:flex;align-items:center;justify-content:center;width:34px;height:34px;background:#111827;color:#00d4ff;font-size:16px;text-decoration:none;cursor:pointer;border-top:1px solid rgba(0,212,255,0.2);';
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.on(link, 'click', function onClick(event) {
      L.DomEvent.preventDefault(event);
      document.dispatchEvent(new CustomEvent(LOCATE_EVENT));
    });
    return container;
  };
  return control;
}

export function initMap({ onPick }) {
  map = L.map('map', { zoomControl: true, attributionControl: true });
  map.setView([DEFAULT_PARCEL.lat, DEFAULT_PARCEL.lon], 11);

  const darkLayer = baseLayer('streets-v2-dark', 'png');
  const satelliteLayer = baseLayer('satellite', 'jpg');
  const topoLayer = baseLayer('topo-v2', 'png');
  darkLayer.addTo(map);

  const baseLayers = {
    '🌑 Oscuro': darkLayer,
    '🛰️ Satélite': satelliteLayer,
    '🏔️ Topográfico': topoLayer
  };
  L.control.layers(baseLayers, {}, { collapsed: false }).addTo(map);
  createLocateControl().addTo(map);

  marker = L.marker([DEFAULT_PARCEL.lat, DEFAULT_PARCEL.lon], {
    title: 'Parcela seleccionada'
  }).addTo(map);

  marker
    .bindPopup(
      `<b>Parcela</b><br>Lat: ${DEFAULT_PARCEL.lat}<br>Lon: ${DEFAULT_PARCEL.lon}<br><small>Andahuaylas, Apurímac</small>`
    )
    .openPopup();

  map.on('click', function onMapClick(event) {
    const { lat, lng } = event.latlng;
    onPick(lat, lng);
  });
}

export function setMarker(lat, lon, { district = '', popupHtml, zoom, openPopup = false } = {}) {
  if (!marker) return;
  marker.setLatLng([lat, lon]);
  if (zoom) map.setView([lat, lon], zoom);
  else map.panTo([lat, lon]);
  marker.setPopupContent(
    popupHtml ??
      `<b>Parcela seleccionada</b><br>Lat: ${parseFloat(lat).toFixed(4)}<br>Lon: ${parseFloat(lon).toFixed(4)}<br><small>${district}, Andahuaylas</small>`
  );
  if (openPopup) marker.openPopup();
}

export function locateUser() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Tu navegador no soporta el servicio de geolocalización.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        reject(new Error(geolocationMessage(error.code)));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

function geolocationMessage(code) {
  if (code === 1) {
    return 'Permiso de ubicación denegado. Activa los permisos de geolocalización en tu navegador.';
  }
  if (code === 2) {
    return 'Posición GPS no disponible en este dispositivo.';
  }
  if (code === 3) {
    return 'Tiempo de espera agotado al consultar la ubicación.';
  }
  return 'No se pudo obtener tu ubicación actual.';
}
