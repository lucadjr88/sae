### esempio di toggle switch

<!DOCTYPE html>
<html lang="it">
<head>
<style>
  /* Contenitore del Toggle */
  .vertical-switch {
    position: relative;
    display: inline-block;
    width: 40px;
    height: 80px;
  }

  /* Nascondiamo l'input checkbox standard */
  .vertical-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  /* Lo sfondo dello switch (Slider) */
  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    transition: .4s;
    border-radius: 34px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
  }

  /* Il "pallino" mobile */
  .slider:before {
    position: absolute;
    content: "";
    height: 32px;
    width: 32px;
    left: 4px;
    bottom: 44px; /* Posizione iniziale (alto) */
    background-color: white;
    transition: .4s;
    border-radius: 50%;
    z-index: 2;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  }

  /* Colore quando attivato */
  input:checked + .slider {
    background-color: #2196F3;
  }

  /* Movimento del pallino verso il basso */
  input:checked + .slider:before {
    transform: translateY(40px);
  }

  /* Stile delle icone */
  .icon {
    font-size: 18px;
    user-select: none;
    z-index: 1;
    color: white;
  }

</style>
</head>
<body>

<h2>Toggle Verticale</h2>

<label class="vertical-switch">
  <input type="checkbox">
  <span class="slider">
    <span class="icon"><img src="src/assets/icons/tax_icon.png" alt="Fee"></span> <span class="icon"><img src="src/assets/icons/resources_icon.png" alt="Resources"></span> </span>
</label>

</body>
</html>