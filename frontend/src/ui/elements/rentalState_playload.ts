import { TICKER_CONFIG } from "./footBar";
import { fetchAndDisplayRentals } from "./rental_playload";
import { setCachedRentalView } from "./toggleSwitch";
import { cancelRentTx, delistFleetTx } from "./rental_tx";
import { computeDisplayedRentalTotal } from "../../utils/rentalDisplay";
import { createListingDetailWindow } from "./list_detail";

// creiamo un dom da esportare come copia backup
export let rentalStateBackup: HTMLElement | null = null;
const MIN_CANCEL_NOTICE_SECONDS = 24 * 60 * 60;

// creiamo la funzione che crearà dentro resultdiv un div rentalState con all'interno 2 div in colonna, uno per le proprie date in affitto un altro per quelle affittate
export function rentalState_playload(data: any,) {
    console.log("[rentalState_playload] Rendering rental state payload", {
        rentedFleetsCount: Array.isArray(data?.rentedFleets) ? data.rentedFleets.length : 0,
    });
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

    // creiamo il pulsante per aprire la finestra di listing
    const listButton = document.createElement("button");
    listButton.textContent = "List";
    listButton.classList.add("list-button");
    listButton.addEventListener("click", () => {
        createListingDetailWindow("", {
            fleets: data?.fleets || [],
        });
    });
    loanedContainer.appendChild(listButton);


    const atlasIcon = `<div><img style="width: 50%" src="${TICKER_CONFIG.find(c => c.id === 'star-atlas')?.img}"/></div>`;

    for (const fleet of data.rentedFleets || []) {
        console.log("[rentalState_playload] Processing rented fleet row:", {
            fleet_id: fleet.fleet_id,
            fleet: fleet.fleet,
            fleet_label: fleet.fleet_label,
            isRented: fleet.isRented,
            isLoaned: fleet.isLoaned,
            isListed: fleet.isListed,
        });
        const fleetName = fleet.fleet_label || fleet.fleet || "Unknown";
        const fleetRate = fleet.rate != null
            ? `${fleet.rate}`
            : "Unknown";
        const fleetRentalStart = fleet.rental_start_time
            ? new Date(fleet.rental_start_time * 1000).toLocaleString()
            : "-";
        const fleetRentalEnd = fleet.rental_end_time
            ? new Date(fleet.rental_end_time * 1000).toLocaleString()
            : "-";
        const secondsRemaining = fleet.rental_end_time
            ? Number(fleet.rental_end_time) - Math.floor(Date.now() / 1000)
            : null;
        const isInsideCancellationNotice = typeof secondsRemaining === "number"
            && secondsRemaining < MIN_CANCEL_NOTICE_SECONDS;


        // Creiamo la riga
        const row = document.createElement("tr");
        const total_amount = computeDisplayedRentalTotal(fleet);

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
            
            <td style="color:#7f2713; display: flex; flex-direction: row; align-items: center;">
            <div>${total_amount !== null ? total_amount : "-"}</div>
            ${total_amount !== null ? atlasIcon : ""}
            <button
                class="cancel-rental-button"
                data-fleet-id="${fleet.fleet_id || fleet.fleet || ""}"
                style="margin-left: 10px;"
            >Cancel</button>
            </td>

        `;

            const cancelRentalButton = row.querySelector(".cancel-rental-button") as HTMLButtonElement | null;
            if (isInsideCancellationNotice && cancelRentalButton) {
                console.log("[rentalState_playload] Cancel disabled due to minimum notice window:", {
                    fleetId: fleet.fleet_id || fleet.fleet,
                    fleetName,
                    rentalEndTime: fleet.rental_end_time,
                    secondsRemaining,
                });
            }
            cancelRentalButton?.addEventListener("click", async () => {
                const fleetId = fleet.fleet_id || fleet.fleet;
                const borrower = window.wallet?.adapter?.publicKey?.toBase58?.();

                console.log("[rentalState_playload] Cancel button clicked:", {
                    fleetId,
                    borrower,
                    fleetName,
                    rentalStart: fleet.rental_start_time,
                    rentalEnd: fleet.rental_end_time,
                });

                if (!fleetId) {
                    console.warn("[rentalState_playload] Missing fleetId, aborting cancel flow");
                    //alert("Fleet ID non disponibile per questa rental");
                    return;
                }

                if (!borrower) {
                    console.warn("[rentalState_playload] Missing borrower wallet, aborting cancel flow");
                    //alert("Wallet non connesso");
                    return;
                }

                cancelRentalButton.disabled = true;
                const previousText = cancelRentalButton.textContent;
                cancelRentalButton.textContent = "Cancelling...";
                console.log("[rentalState_playload] Cancel button state updated to Cancelling...");

                try {
                    console.log("[rentalState_playload] Invoking cancelRentTx");
                    await cancelRentTx({
                        fleet_id: fleetId,
                        borrower,
                    });
                    console.log("[rentalState_playload] cancelRentTx completed");
                } finally {
                    cancelRentalButton.disabled = false;
                    cancelRentalButton.textContent = previousText;
                    console.log("[rentalState_playload] Cancel button restored after flow completion");
                }
            });
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
            <div>${total_amount !== null ? total_amount : "-"}</div>
            ${total_amount !== null ? atlasIcon : ""}
            <button
                class="delist-button"
                data-fleet-id="${fleet.fleet_id || fleet.fleet || ""}"
                style="margin-left: 10px;"
            >Delist</button>
            </td>
        `;

            const delistButton = row.querySelector(".delist-button") as HTMLButtonElement | null;
            delistButton?.addEventListener("click", async () => {
                const fleetId = fleet.fleet_id || fleet.fleet;
                const owner = window.wallet?.adapter?.publicKey?.toBase58?.();
                const contractAddress = fleet.contractPubkey || fleet.contract || fleet.address || undefined;

                console.log("[rentalState_playload] Delist button clicked:", {
                    fleetId,
                    owner,
                    contractAddress,
                    fleetName,
                    isLoaned: fleet.isLoaned,
                    isListed: fleet.isListed,
                });

                if (!fleetId) {
                    console.warn("[rentalState_playload] Missing fleetId, aborting delist flow");
                    //alert("Fleet ID non disponibile per questo listing");
                    return;
                }

                if (!owner) {
                    console.warn("[rentalState_playload] Missing owner wallet, aborting delist flow");
                    //alert("Wallet non connesso");
                    return;
                }

                delistButton.disabled = true;
                const previousText = delistButton.textContent;
                delistButton.textContent = "Delisting...";

                try {
                    await delistFleetTx({
                        fleet_id: fleetId,
                        owner,
                        contractAddress,
                    });
                } finally {
                    delistButton.disabled = false;
                    delistButton.textContent = previousText;
                }
            });

            loanedBody.appendChild(row);
        }
    }
    rentalStateBackup = rentalState as HTMLElement;
    setCachedRentalView(rentalStateBackup);

}
