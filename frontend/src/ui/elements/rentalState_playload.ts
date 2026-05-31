import { TICKER_CONFIG } from "./footBar";
import { fetchAndDisplayRentals } from "./rental_playload";
import { setActiveViewPreference, setCachedRentalView } from "./toggleSwitch";
import { cancelRentTx, delistFleetTx, listFleetTx } from "./rental_tx";
import { computeDisplayedRentalTotal } from "../../utils/rentalDisplay";
import { isLikelyTransactionSignature } from "@/utils/txFlow";
import { createBaseDialog, removeDialogById, renderErrorCard, renderLoadingCard } from "./modal_base";
import { resolveTxTimeRange } from "@/utils/utils";

// creiamo un dom da esportare come copia backup
export let rentalStateBackup: HTMLElement | null = null;
const MIN_CANCEL_NOTICE_SECONDS = 24 * 60 * 60;

const atlasIcon = `<div><img style="width: 50%" src="${TICKER_CONFIG.find(c => c.id === 'star-atlas')?.img}"/></div>`;

function normalizeFleetOption(fleet: any): { value: string; label: string } | null {
    const value = String(fleet?.key || fleet?.fleet || fleet?.pubkey || fleet?.data?.fleetShips || "").trim();
    const label = String(fleet?.callsign || fleet?.fleet_label || fleet?.fleet_name || value || "").trim();

    if (!value && !label) {
        return null;
    }

    return {
        value: value || label,
        label: label || value,
    };
}

type ListingDialogOptions = {
    title?: string;
    fleets?: any[];
    selectedFleet?: string;
};

type ListingFormSection = {
    fleetSelect: HTMLSelectElement;
    listingActionArea: HTMLDivElement;
    rateInput: HTMLInputElement;
    submitButton: HTMLButtonElement;
};

function createDialogSelect(id: string): HTMLSelectElement {
    const select = document.createElement("select");
    select.id = id;
    select.style.minWidth = "320px";
    select.style.padding = "12px";
    select.style.borderRadius = "8px";
    select.style.fontSize = "1rem";
    return select;
}

function populateDialogSelect(
    select: HTMLSelectElement,
    placeholder: string,
    options: Array<{ value: string; label: string }>,
    selectedValue = ""
) {
    select.innerHTML = "";
    select.appendChild(new Option(placeholder, ""));
    for (const option of options) {
        select.appendChild(new Option(option.label, option.value));
    }

    if (selectedValue) {
        const matchedOption = options.find((option) => option.value === selectedValue || option.label === selectedValue);
        if (matchedOption) {
            select.value = matchedOption.value;
        }
    }
}

function createDialogNumberInput(id: string, placeholder: string): HTMLInputElement {
    const input = document.createElement("input");
    input.id = id;
    input.type = "number";
    input.min = "1";
    input.step = "1";
    input.placeholder = placeholder;
    input.className = "listingRateInput";
    return input;
}

function createDialogActions(width = "320px"): HTMLDivElement {
    const actions = document.createElement("div");
    actions.style.display = "none";
    actions.style.flexDirection = "column";
    actions.style.gap = "12px";
    actions.style.width = width;
    return actions;
}

function createListingFormSection(contentEl: HTMLDivElement, atlasIcon: string): ListingFormSection {
    contentEl.innerHTML = "";
    contentEl.style.display = "flex";
    contentEl.style.flexDirection = "column";
    contentEl.style.justifyContent = "center";
    contentEl.style.alignItems = "center";
    contentEl.style.gap = "16px";
    contentEl.style.paddingTop = "24px";

    const fleetSelect = createDialogSelect("listingFleetSelect");
    const listingActionArea = createDialogActions("320px");
    listingActionArea.id = "listingActionArea";

    const rateInput = createDialogNumberInput("listingRateInput", "Rate / day");
    const rateMeta = document.createElement("div");
    rateMeta.style.display = "flex";
    rateMeta.style.alignItems = "center";
    rateMeta.style.justifyContent = "center";
    rateMeta.style.gap = "8px";
    rateMeta.innerHTML = `${atlasIcon}<span style="font-size: x-large;
                                        color: blueviolet;
                                        font-weight: 900;">/ day</span>`;

    const submitButton = document.createElement("button");
    submitButton.id = "listingSubmitButton";
    submitButton.className = "listingSubmitButton";
    submitButton.type = "button";
    submitButton.textContent = "List";

    const actionAreraContainer = document.createElement("div");
    actionAreraContainer.style.display = "flex";
    actionAreraContainer.style.flexDirection = "row";
    actionAreraContainer.style.alignItems = "center";
    actionAreraContainer.appendChild(rateInput);
    actionAreraContainer.appendChild(rateMeta);
    listingActionArea.appendChild(actionAreraContainer);
    listingActionArea.appendChild(submitButton);
    contentEl.appendChild(fleetSelect);
    contentEl.appendChild(listingActionArea);

    return {
        fleetSelect,
        listingActionArea,
        rateInput,
        submitButton,
    };
}

function setListingDialogState(
    contentEl: HTMLDivElement,
    state: "loading" | "success" | "error",
    options: { message: string; detail?: string; txSignature?: string }
) {
    contentEl.innerHTML = "";

    if (state === "loading") {
        contentEl.appendChild(renderLoadingCard(options.message));
        return;
    }

    if (state === "error") {
        contentEl.appendChild(renderErrorCard(options.message, options.detail));
        return;
    }

    const successCard = document.createElement("div");
    successCard.className = "detail-card success-card";

    const messageEl = document.createElement("h3");
    messageEl.textContent = options.message;
    successCard.appendChild(messageEl);

    if (options.txSignature) {
        const signatureLabel = document.createElement("p");
        signatureLabel.textContent = "Tx Signature:";

        const signatureEl = document.createElement("p");
        signatureEl.textContent = options.txSignature;
        signatureEl.style.wordBreak = "break-all";
        signatureEl.style.cursor = "pointer";
        signatureEl.style.color = "blue";
        signatureEl.style.backgroundColor = "#8a2be25c";
        signatureEl.style.padding = "8px";
        signatureEl.style.borderRadius = "6px";
        signatureEl.title = "Click to copy";

        const hintEl = document.createElement("p");
        hintEl.style.fontSize = "0.9em";
        hintEl.style.color = "#555";
        hintEl.textContent = "(Click the tx hash to copy)";

        signatureEl.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(options.txSignature || "");
                hintEl.textContent = "Copied to clipboard.";
            } catch {
                hintEl.textContent = "Copy unavailable in this browser context.";
            }
        });

        const explorerLink = document.createElement("a");
        explorerLink.href = `https://solscan.io/tx/${options.txSignature}`;
        explorerLink.target = "_blank";
        explorerLink.rel = "noopener noreferrer";
        explorerLink.textContent = "Open on Solscan";

        successCard.appendChild(signatureLabel);
        successCard.appendChild(signatureEl);
        successCard.appendChild(hintEl);
        successCard.appendChild(explorerLink);
    }

    contentEl.appendChild(successCard);
}

function openListingDialog(options: ListingDialogOptions = {}) {
    const {
        title = "Listing Details",
        fleets = [],
        selectedFleet = "",
    } = options;

    console.log("[listing-window] Opening listing detail window", {
        title,
        fleetsCount: Array.isArray(fleets) ? fleets.length : 0,
        selectedFleet,
    });

    removeDialogById("listingDetailWindow", ".listingDetailOverlay");

    const { windowEl: listingWindow, contentEl, close } = createBaseDialog({
        id: "listingDetailWindow",
        title,
        overlayClassName: "rentalContractOverlay listingDetailOverlay",
        windowClassName: "rental-contract-window listing-detail-window",
        closeButtonId: "closeListingDetailWindow",
    });

    const { fleetSelect, listingActionArea, rateInput, submitButton } = createListingFormSection(contentEl, atlasIcon);

    const updateActionAreaVisibility = () => {
        listingActionArea.style.display = fleetSelect.value ? "flex" : "none";
        submitButton.disabled = !fleetSelect.value;
        console.log("[listing-window] Action area visibility updated", {
            selectedFleet: fleetSelect.value || null,
            actionAreaDisplay: listingActionArea.style.display,
            submitDisabled: submitButton.disabled,
        });
    };

    const optionsList = Array.isArray(fleets)
        ? Array.from(
            new Map(
                fleets
                    .filter((fleet) => !fleet?.isListed && !fleet?.isLoaned && !fleet?.isRented)
                    .map(normalizeFleetOption)
                    .filter((fleet): fleet is { value: string; label: string } => Boolean(fleet))
                    .map((fleet) => [fleet.value, fleet])
            ).values()
        )
        : [];

    console.log("[listing-window] Prepared listable fleet options", {
        optionsCount: optionsList.length,
        sample: optionsList.slice(0, 5),
    });

    if (!optionsList.length) {
        console.warn("[listing-window] No listable fleets available in cache");
        populateDialogSelect(fleetSelect, "No fleets available in cache", []);
        fleetSelect.disabled = true;
        listingActionArea.style.display = "none";
        return listingWindow;
    }

    populateDialogSelect(fleetSelect, "Select fleet", optionsList, selectedFleet);

    const submitListing = async () => {
        const fleetId = fleetSelect.value.trim();
        const ratePerDay = Number.parseInt(rateInput.value, 10);
        const owner = window.wallet?.adapter?.publicKey?.toBase58?.();

        console.log("[listing-window] Submit requested", {
            fleetId,
            rateInput: rateInput.value,
            parsedRatePerDay: ratePerDay,
            owner,
        });

        if (!fleetId) {
            console.warn("[listing-window] Submit blocked: missing fleet selection");
            return;
        }

        if (!owner) {
            console.warn("[listing-window] Submit blocked: wallet not connected");
            return;
        }

        if (!Number.isFinite(ratePerDay) || ratePerDay <= 0) {
            console.warn("[listing-window] Submit blocked: invalid rate/day", { rateInput: rateInput.value });
            rateInput.focus();
            return;
        }

        submitButton.disabled = true;
        fleetSelect.disabled = true;
        rateInput.disabled = true;
        setListingDialogState(contentEl, "loading", { message: "Sending TX..." });

        try {
            const { currentProfileId } = await import("@/utils/state");
            console.log("[listing-window] Calling listFleetTx", {
                fleetId,
                ratePerDay,
                owner,
                profileId: currentProfileId || undefined,
            });
            const listed = await listFleetTx({
                fleet_id: fleetId,
                rate: ratePerDay,
                owner,
                profileId: currentProfileId || undefined,
            });

            console.log("[listing-window] listFleetTx completed", { listed, fleetId, ratePerDay });
            const txSignature = typeof listed === "string" ? listed.trim() : "";
            if (isLikelyTransactionSignature(txSignature)) {
                setListingDialogState(contentEl, "success", {
                    message: "Fleet listed successfully!",
                    txSignature,
                });
            } else {
                console.error("[listing-window] Listing failed with error", { error: listed });
                setListingDialogState(contentEl, "error", {
                    message: "Failed to list fleet",
                    detail: typeof listed === "string" ? listed : "Unknown error",
                });
            }
        } finally {
            console.log("[listing-window] Restoring UI state after listing attempt");
            setTimeout(async () => {
                close();
                setActiveViewPreference("rental");
                const { currentProfileId } = await import("@/utils/state");
                if (currentProfileId) {
                    const { analyzeFees } = await import("@/services/api");
                    await analyzeFees(currentProfileId, false);
                }
            }, 50000);
        }
    };

    fleetSelect.addEventListener("change", () => {
        console.log("[listing-window] Fleet selection changed", { selectedFleet: fleetSelect.value || null });
        updateActionAreaVisibility();
    });
    submitButton.addEventListener("click", () => {
        void submitListing();
    });
    rateInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            void submitListing();
        }
    });
    updateActionAreaVisibility();

    return listingWindow;
}

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
    const { timeFirstTx, timeLastTx, ageLastTx } = resolveTxTimeRange(data);
    title.textContent = "Your Rentals from " + timeFirstTx + " to " + timeLastTx + " Age: " + ageLastTx;
    headerRow.appendChild(title);

    const rentalProgramButton = document.createElement("button");
    rentalProgramButton.id = "rentalProgramButton";
    rentalProgramButton.textContent = "Search Contracts";
    headerRow.appendChild(rentalProgramButton);
    //passa a rental playload
    rentalProgramButton.addEventListener("click", () => {
        console.log("Rental Program Button Clicked");
        fetchAndDisplayRentals();
    });


    // Funzione helper per creare una tabella vuota con testata
    function createRentalTable(title) {
        const container = document.createElement("div");
        container.classList.add(title.toLowerCase());

        container.innerHTML = `
        <h3>${title}</h3>
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
        const blockedFleetKeys = new Set(
            (data?.rentedFleets || [])
                .filter((fleet: any) => fleet?.isListed || fleet?.isLoaned)
                .flatMap((fleet: any) => [
                    fleet?.fleet,
                    fleet?.pubkey,
                    fleet?.fleet_ships,
                    fleet?.fleetData?.fleetShips,
                    fleet?.callsign,
                    fleet?.fleet_label,
                ])
                .map((value: unknown) => String(value || "").trim())
                .filter(Boolean)
        );

        const listableFleets = (data?.fleets || []).filter((fleet: any) => {
            if (fleet?.isListed || fleet?.isLoaned || fleet?.isRented) return false;
            const fleetKeys = [fleet?.key, fleet?.callsign, fleet?.data?.fleetShips]
                .map((value: unknown) => String(value || "").trim())
                .filter(Boolean);
            return !fleetKeys.some((value) => blockedFleetKeys.has(value));
        });

        openListingDialog({
            fleets: listableFleets,
        });
    });
    loanedContainer.appendChild(listButton);


    

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
            ? `${parseInt(fleet.rate, 10)}`
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
        const displayedTotal = computeDisplayedRentalTotal(fleet);
        const total_amount = displayedTotal === null ? null : Number.parseFloat(displayedTotal);

        if (fleet.isRented) {
            row.classList.add("fleet-item-rented");
            row.innerHTML = `
            <td>${fleetName}</td>
            <td style= "display: flex; flex-direction: row; align-items: center;">
            <div style="display: flex; flex-direction: row; align-items: center;">${fleetRate} ${atlasIcon}</div>
            </td>
            <td>${fleetRentalStart}</td>
            <td>${fleetRentalEnd}</td>
            
            <td style="color:#7f2713; display: flex; flex-direction: row; align-items: center;">
            <div style="display: flex; flex-direction: row; align-items: center;">${total_amount !== null ? total_amount : "-"} ${total_amount !== null ? atlasIcon : ""}</div>
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

                removeDialogById("cancelRentalWindow", ".cancelRentalOverlay");
                const {
                    contentEl: cancelContent,
                    close: closeCancelDialog,
                } = createBaseDialog({
                    id: "cancelRentalWindow",
                    title: "Cancelling rental...",
                    overlayClassName: "rentalContractOverlay cancelRentalOverlay",
                    closeButtonId: "closeCancelRentalWindow",
                });

                if (!fleetId) {
                    console.warn("[rentalState_playload] Missing fleetId, aborting cancel flow");
                    setListingDialogState(cancelContent, "error", {
                        message: "Unable to cancel rental",
                        detail: "Fleet ID not available for this rental.",
                    });
                    return;
                }

                if (!borrower) {
                    console.warn("[rentalState_playload] Missing borrower wallet, aborting cancel flow");
                    setListingDialogState(cancelContent, "error", {
                        message: "Unable to cancel rental",
                        detail: "Wallet not connected.",
                    });
                    return;
                }

                cancelRentalButton.disabled = true;
                const previousText = cancelRentalButton.textContent;
                cancelRentalButton.textContent = "Cancelling...";
                console.log("[rentalState_playload] Cancel button state updated to Cancelling...");
                setListingDialogState(cancelContent, "loading", { message: "Cancelling rental..." });

                try {
                    console.log("[rentalState_playload] Invoking cancelRentTx");
                    const result = await cancelRentTx({
                        fleet_id: fleetId,
                        borrower,
                    });
                    console.log("[rentalState_playload] cancelRentTx completed", { result });

                    const txSignature = typeof result === "string" ? result.trim() : "";
                    if (isLikelyTransactionSignature(txSignature)) {
                        setListingDialogState(cancelContent, "success", {
                            message: "Rental cancelled successfully!",
                            txSignature,
                        });
                    } else {
                        setListingDialogState(cancelContent, "error", {
                            message: "Failed to cancel rental",
                            detail: typeof result === "string" && result ? result : "Unknown error",
                        });
                    }
                } finally {
                    cancelRentalButton.disabled = false;
                    cancelRentalButton.textContent = previousText;
                    console.log("[rentalState_playload] Cancel button restored after flow completion");
                    setTimeout(async () => {
                        closeCancelDialog();
                        setActiveViewPreference("rental");
                        const { currentProfileId } = await import("@/utils/state");
                        if (currentProfileId) {
                            const { analyzeFees } = await import("@/services/api");
                            await analyzeFees(currentProfileId, false);
                        }
                    }, 50000);
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

                const {
                    contentEl: delistContent,
                    close: closeDelistDialog,
                } = createBaseDialog({
                    id: 'delistWindow',
                    title: 'Delisting...',
                    closeButtonId: 'closeWindow',
                });

                const loadingCard = renderLoadingCard('Delisting...');
                delistContent.appendChild(loadingCard);

                let result;
                try {
                    result = await delistFleetTx({
                        fleet_id: fleetId,
                        owner,
                        contractAddress,
                    });
                    console.log("[rentalState_playload] Delist transaction result:", result);
                    const divResult = document.createElement("div");
                    const isTxHash = typeof result === "string" && /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(result);
                    if (isTxHash) {
                        console.log("[rentalState_playload] Delist completed with transaction signature:", result);
                        //divResult.textContent = typeof result === "string" ? result : "Delist successful";
                        divResult.innerHTML = `<H3 style="background-color: blueviolet;">Delist successful!</H3>
                        <p>Tx Signature:</p>
                        <p style="
                            word-break: break-all; 
                            cursor: pointer; 
                            color: blue; 
                            background-color: #8a2be25c;
                            white-space: nowrap;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            width: 200px; 
                            transition: text-decoration 0.2s;
                            "onmouseover="this.style.textDecoration='underline'"
                            onmouseout="this.style.textDecoration='none'" onclick="navigator.clipboard.writeText('${result}')">${result}</p>
                            <p style="font-size: 0.9em; color: #555;">(Click the tx hash to copy)</p>`;
                    } else {
                        console.warn("[rentalState_playload] Delist returned a message instead of a tx signature:", result);
                        divResult.innerHTML = `<H3 style="background-color: blueviolet;">Delist Result</H3><p style="background-color: #8a2be25c;">${typeof result === "string" ? result : "Delist completed"}</p>`;
                    }

                    delistContent.innerHTML = '';
                    delistContent.appendChild(divResult);
                } finally {
                    console.log("[rentalState_playload] Delist process completed");
                    setTimeout(async () => {
                        closeDelistDialog();
                        setActiveViewPreference("rental");
                        const { currentProfileId } = await import("@/utils/state");
                        if (currentProfileId) {
                            const { analyzeFees } = await import("@/services/api");
                            await analyzeFees(currentProfileId, false);
                        }
                        console.log("[rentalState_playload] Refreshing rental view after delist process");
                    }, 50000);
                }
            });

            loanedBody.appendChild(row);
        }
    }
    rentalStateBackup = rentalState as HTMLElement;
    setCachedRentalView(rentalStateBackup);

}
