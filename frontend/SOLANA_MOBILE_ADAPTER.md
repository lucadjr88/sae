
dependencies {
    implementation("com.solanamobile:mobile-wallet-adapter-clientlib-ktx:2.0.3")
    implementation("com.solanamobile:web3-solana:0.2.5")
    implementation("com.solanamobile:rpc-core:0.2.7")
    implementation("io.github.funkatronics:multimult:0.2.3")
}

import com.solana.mobilewalletadapter.clientlib.*

// Define dApp's identity metadata
val solanaUri = Uri.parse("https://yourdapp.com")
val iconUri = Uri.parse("favicon.ico") // resolves to https://yourdapp.com/favicon.ico
val identityName = "Solana Kotlin dApp"

// Construct the client
val walletAdapter = MobileWalletAdapter(connectionIdentity = ConnectionIdentity(
    identityUri = solanaUri,
    iconUri = iconUri,
    identityName = identityName
))


ConnectionIdentity fields
Field	Type	Description
identityUri	Uri	Your app’s website URL.
iconUri	Uri	Path to your app icon, relative to identityUri.
identityName	String	Your app’s display name shown to the user during wallet authorization.

Establishing an MWA session
To establish a session with an MWA wallet, use the transact method. Calling transact dispatches an association intent to a locally installed MWA wallet app and prompts the user to approve or reject the connection.
Once connected, you can issue MWA requests within the provided callback:
import com.solana.mobilewalletadapter.clientlib.*

// `this` is the current Android activity
val sender = ActivityResultSender(this)

val result = walletAdapter.transact(sender) { authResult ->
    /* Once connected, send requests to the wallet in this callback */
}
When the session is complete, transact returns a TransactionResult that can be checked for success or failure:
when (result) {
    is TransactionResult.Success -> {
        val authResult = result.authResult
        // Handle success
    }
    is TransactionResult.NoWalletFound -> {
        println("No MWA compatible wallet app found on device.")
    }
    is TransactionResult.Failure -> {
        println("Error: " + result.e.message)
    }
}
​
Managing the authToken
The MobileWalletAdapter client stores an authToken from successful connections. If valid, the user can skip the connection approval dialog for subsequent requests.
You can also persist and restore the token across app sessions:
// Restore a previously persisted authToken
val previouslyStoredAuthToken = maybeGetStoredAuthToken()
walletAdapter.authToken = previouslyStoredAuthToken

## CONNECTION EXAMPLE
Connect / Disconnect
Use connect to establish a wallet connection. On success, the TransactionResult contains an AuthorizationResult with the user’s wallet address and auth token.
import com.solana.mobilewalletadapter.clientlib.*

val sender = ActivityResultSender(this)
val walletAdapter = MobileWalletAdapter(/* ... */)

val result = walletAdapter.connect(sender)

when (result) {
    is TransactionResult.Success -> {
        val authResult = result.authResult
        println("Connected to: " + authResult.accounts.first().publicKey)
    }
    is TransactionResult.NoWalletFound -> {
        println("No MWA compatible wallet app found on device.")
    }
    is TransactionResult.Failure -> {
        println("Error connecting to wallet: " + result.e.message)
    }
}
Use disconnect to revoke authorization and invalidate the stored auth token:
val result = walletAdapter.disconnect(sender)