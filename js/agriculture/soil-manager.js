import { setState } from '../state.js';

const byId = (id) => document.getElementById(id);

export function readSoilForm() {
  const water = document.querySelector('input[name="agua"]:checked');
  return {
    texture: byId('sel-textura').value,
    ph: parseFloat(byId('in-ph').value),
    organicMatter: byId('sel-mo').value,
    drainage: byId('sel-drenaje').value,
    water: water ? water.value : ''
  };
}

export function writeSoilForm(soil) {
  byId('sel-textura').value = soil.texture;
  byId('in-ph').value = soil.ph;
  byId('sel-mo').value = soil.organicMatter;
  byId('sel-drenaje').value = soil.drainage;
  const water = document.querySelector(`input[name="agua"][value="${soil.water}"]`);
  if (water) water.checked = true;
}

export function saveSoil() {
  setState({ soil: readSoilForm() });
}
