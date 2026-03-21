import { TICKER_CONFIG } from "./footBar";
import { fetchAndDisplayRentals } from "./rental_playload";
import { setCachedRentalView } from "./toggleSwitch";

// creiamo un dom da esportare come copia backup
export let rentalStateBackup: HTMLElement | null = null;


// creiamo la funzione che crearà dentro resultdiv un div rentalState con all'interno 2 div in colonna, uno per le proprie date in affitto un altro per quelle affittate
export function rentalState_playload(data: any,) {
        // creiamo il div rentalState
        const rentalState = document.createElement("div");
        rentalState.classList.add("rentalState");

        // Aggiungiamo una riga con un titolo a sinistra "Your Rentals" ed un pulsante a destra "Rental Program"
        const headerRow = document.createElement("div");
        headerRow.classList.add("rentalState-header");
        rentalState.appendChild(headerRow);
        const title = document.createElement("h2");
        title.textContent = "Your Rentals";
        headerRow.appendChild(title);

        const rentalProgramButton = document.createElement("button");
        rentalProgramButton.id = "rentalProgramButton";
        rentalProgramButton.textContent = "Search Contracts";
        headerRow.appendChild(rentalProgramButton);

        rentalProgramButton.addEventListener("click", () => {
            console.log("Rental Program Button Clicked");
            fetchAndDisplayRentals();
        });


        // Funzione helper per creare una tabella vuota con testata
        function createRentalTable(title) {
            const container = document.createElement("div");
            container.classList.add(title.toLowerCase());

            container.innerHTML = `
        <h3>  ${title}</h3>
        <table class="rentalState-table">
            <thead>
                <tr>
                    <th>Fleet Name</th>
                    <th>Rate</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Total amount</th>
                </tr>
            </thead>
            <tbody></tbody>
        </table>
    `;
            return container;
        }

        // Creiamo i contenitori con le tabelle
        const rentalStateTableContainer = document.createElement("div");
        rentalStateTableContainer.classList.add("rentalState-table-container");

        const loanedContainer = createRentalTable("Loaned");
        const borrowedContainer = createRentalTable("Borrowed");

        rentalStateTableContainer.appendChild(loanedContainer);
        rentalStateTableContainer.appendChild(borrowedContainer);
        rentalState.appendChild(rentalStateTableContainer);

        // Referenze ai corpi delle tabelle per l'inserimento rapido
        const loanedBody = loanedContainer.querySelector("tbody");
        const borrowedBody = borrowedContainer.querySelector("tbody");

        const atlasIcon = `<div><img style="width: 50%" src="${TICKER_CONFIG.find(c => c.id === 'star-atlas')?.img}"/></div>`;

        for (const fleet of data.rentedFleets || []) {
            const fleetName = fleet.fleet_label || fleet.fleet || "Unknown";
            const fleetRate = fleet.rate || "Unknown";
            const fleetRentalStart = fleet.rental_start_time
                ? new Date(fleet.rental_start_time * 1000).toLocaleString()
                : "-";
            const fleetRentalEnd = fleet.rental_end_time
                ? new Date(fleet.rental_end_time * 1000).toLocaleString()
                : "-";

            // Creiamo la riga
            const row = document.createElement("tr");
            // calcoliamo total amount moltiplicando rate per la durata in giorni, se rental_start_time e rental_end_time sono presenti, altrimenti mostriamo "-"
            let total_amount = null;
            if (fleet.rental_start_time && fleet.rental_end_time && fleet.rate) {
                const start = new Date(fleet.rental_start_time * 1000);
                const end = new Date(fleet.rental_end_time * 1000);
                const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24); // durata in giorni
                total_amount = (duration * fleet.rate).toFixed(2);
            }

            if (fleet.isRented) {
                row.classList.add("fleet-item-rented");
                row.innerHTML = `
            <td>${fleetName}</td>
            <td style= "display: flex; flex-direction: row; align-items: center;">
            <div>${fleetRate} </div>
            ${atlasIcon}
            </td>
            <td>${fleetRentalStart}</td>
            <td>${fleetRentalEnd}</td>
            
            <td style="color:#ff3000; display: flex; flex-direction: row; align-items: center;">
            <div>${total_amount ? total_amount : "-"}</div>
            ${total_amount ? atlasIcon : ""}
            </td>

        `;
                borrowedBody.appendChild(row);
            } else if (fleet.isLoaned || fleet.isListed) {
                const statusClass = fleet.isListed ? "fleet-item-listed" : "fleet-item-loaned";
                row.classList.add(statusClass);

                // Se è solo listed, potresti voler mostrare un messaggio diverso per le date
                const endDateDisplay = fleet.isListed ? "<em>Listed</em>" : fleetRentalEnd;
                //usiamo l'icona di atlas a fianco a rate e total amount
                row.innerHTML = `
            <td>${fleetName}</td>
            <td style= "display: flex; flex-direction: row; align-items: center;">
            <div>${fleetRate} </div>
            ${atlasIcon}
            </td>
            <td>${fleetRentalStart}</td>
            <td>${endDateDisplay}</td>
            <td style="color:green; display: flex; flex-direction: row; align-items: center;">
            <div>${total_amount ? total_amount : "-"}</div>
            ${total_amount ? atlasIcon : ""}
            </td>
        `;
                loanedBody.appendChild(row);
            }
        }
        rentalStateBackup = rentalState as HTMLElement;
    setCachedRentalView(rentalStateBackup);

}
