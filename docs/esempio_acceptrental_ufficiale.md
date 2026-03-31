async acceptRental(e, t, a, n) {
                let {borrowerPublicKey: i, borrowerProfile: o, fleet: r, gameId: l, mint: s} = n;
                try {
                    let n, [c] = D.PublicKey.findProgramAddressSync([er.from("rental_authority")], T().SRSLY), d = new F.AnchorProvider(U.FI,this.walletViewModel.walletAdapter.currentAdapter,F.AnchorProvider.defaultOptions()), u = new L.AnchorProvider(U.FI,this.walletViewModel.walletAdapter.currentAdapter,L.AnchorProvider.defaultOptions()), p = new L.Program(x.PROFILE_FACTION_IDL,T().FACTION_PROGRAM,u), h = new F.Program(eo,d), g = this.getContractStateByFleetKey(e.fleet.key);
                    if (null == g ? void 0 : g.address)
                        n = new D.PublicKey(g.address),
                        console.log("[FleetRentalsModel] Using cached contract address:", n.toBase58());
                    else {
                        let[e] = D.PublicKey.findProgramAddressSync([er.from("rental_contract"), r.toBuffer()], T().SRSLY);
                        n = e,
                        console.log("[FleetRentalsModel] Derived contract PDA:", n.toBase58())
                    }
                    let[f] = D.PublicKey.findProgramAddressSync([F.utils.bytes.utf8.encode("rental_state"), n.toBuffer(), i.toBuffer()], h.programId)
                      , [m] = D.PublicKey.findProgramAddressSync([F.utils.bytes.utf8.encode("sage_player_profile"), o.toBuffer(), l.toBuffer()], T().SAGE)
                      , [y] = D.PublicKey.findProgramAddressSync([F.utils.bytes.utf8.encode("thread"), c.toBuffer(), f.toBuffer()], T().ANTIGEN)
                      , b = await (0,
                    P.Ob)(s, i)
                      , w = await (0,
                    P.Ob)(s, f, !0)
                      , M = await (0,
                    P.Ob)(s, T().SLY_SQUADS, !0)
                      , S = x.ProfileFactionAccount.findAddress(p, o)[0]
                      , I = {
                        mud: {
                            x: 0,
                            y: -39
                        },
                        oni: {
                            x: -40,
                            y: 30
                        },
                        ustur: {
                            x: 40,
                            y: 30
                        }
                    }
                      , A = await p.account.profileFactionAccount.fetch(S)
                      , v = "number" == typeof A.faction ? ({
                        1: "mud",
                        2: "oni",
                        3: "ustur"
                    })[A.faction] : A.faction;
                    if (!v || !I[v])
                        throw Error("Unsupported faction: ".concat(A.faction));
                    let C = I[v]
                      , j = [new F.BN(C.x), new F.BN(C.y)]
                      , N = er.from("Starbase")
                      , [k] = D.PublicKey.findProgramAddressSync([N, l.toBuffer(), j[0].toTwos(64).toArrayLike(er, "le", 8), j[1].toTwos(64).toArrayLike(er, "le", 8)], T().SAGE)
                      , z = new ArrayBuffer(2);
                    new DataView(z).setUint16(0, 0, !0);
                    let R = new Uint8Array(z)
                      , [E] = D.PublicKey.findProgramAddressSync([F.utils.bytes.utf8.encode("starbase_player"), k.toBuffer(), m.toBuffer(), R], T().SAGE);
                    console.log("Accepting Fleet Rental ".concat(e.fleet.fleetLabel, " (").concat(e.fleet.key, ")"), {
                        borrowerPublicKey: i,
                        borrowerProfile: o,
                        borrowerTokenAccount: b,
                        fleet: r,
                        gameId: l,
                        mint: s,
                        starbase: k,
                        starbasePlayer: E,
                        contractPda: n,
                        rentalState: f,
                        rentalAuthorityPda: c,
                        rentalTokenAccount: w,
                        threadId: y,
                        feeTokenAccount: M
                    });
                    let O = await h.methods.acceptRental(t, a).accountsStrict({
                        mint: s,
                        borrower: i,
                        borrowerProfile: o,
                        borrowerProfileFaction: S,
                        borrowerTokenAccount: b,
                        fleet: r,
                        gameId: l,
                        starbase: k,
                        starbasePlayer: E,
                        contract: n,
                        rentalState: f,
                        rentalAuthority: c,
                        rentalTokenAccount: w,
                        rentalThread: y,
                        feeTokenAccount: M,
                        sageProgram: T().SAGE,
                        antegenProgram: T().ANTIGEN,
                        tokenProgram: T().TOKEN_PROGRAM,
                        associatedTokenProgram: T().ASSOCIATED_TOKEN_PROGRAM,
                        systemProgram: T().SYS_PROGRAM
                    }).rpc({
                        skipPreflight: !0
                    });
                    return console.log("Accept Rental Tx Signature: ".concat(O)),
                    O
                } catch (e) {
                    throw console.log("acceptRental error:", e),
                    e
                }
            }
            