## Rental Contracts

# campi attuali presemti in ogni rental contract (esempio reale):

      "address": "1GPi779d3e3fXCWrBnPLu2Tc29RQYgZCkhJCg74fmwt",
      "owner": "EBZpvy3cLZktkTNxEEdN6xLNY6YtZ7TFQvYChzBdU1Cu",
      "owner_profile": "Eyf2QJ8yTCu3ZXBz2V3x1J4xQ8twekMgGHChH4g6qA8",
      "fleet": "3GewAmbfXfN3EekmmcX4dVdZJ1J1FXEra8AVZ12nmDak",
      "game_id": "GAMEzqJehF8yAnKiTARUuhZMvLvkZVAsCVri5vSfemLr",
      "rate": 836,
      "duration_min": 1,
      "duration_max": 24,
      "payment_frequency": "Minute",
      "to_close": false,
      "current_rental_state": "GFyQvqGjoF58nQYdn4FPvKvdGgbJeAsHVNfhTDo5cJuX",
      "owner_token_account": "7a93z66oNTDqcKCzMuCN4fv65XTb2oDDBhBqLwgo1kb3",
      "fleet_name": "Alpaca Fleet",
      "fleet_composition": "16x Fimbul BYOS Earp",
      "fleet_ships": "2J7QPgTfKf3WaCEgL3AHnyeeQafAinZCXgHeAC91x3eU",
      "starbase": "oni",
      "faction": 2

# requisiti (attualmente presenti)

per costruire la tabella dei rental al momento utiilizziamo:
- fleet_name
- starbase
- rate
- fleet_composition
- current_rental_state

# non forniti per cui sono necessari fetch ulteriori:
- crew
- fuel level / fuel tank capacity
- ammo level / ammo tank capacity
- cargo level / cargo tank capacity
- posizione attuale/settore