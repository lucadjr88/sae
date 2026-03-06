import taxIcon from '../../assets/icons/tax_icon.png';
import resourcesIcon from '../../assets/icons/resources_icon.png';

export const toggleSwitchHTML = `
<label class="vertical-switch">
  <input type="checkbox">
  <span class="slider">
    <span class="toggleSwitch-icon"><img src="${taxIcon}" alt="Fee"></span> <span class="toggleSwitch-icon"><img src="${resourcesIcon}" alt="Resources"></span> </span>
</label>`;

