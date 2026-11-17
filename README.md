# Token Radar

A token launch radar: it reads a sealed DefiLlama snapshot of 758 protocols and ranks every
launch candidate — every protocol that records no token and is not a wrapped, staked or bridged
product of a token that already trades — by what its launch would be worth, each with an
eight-step farm plan.

## The model (`radar-2`, in `lib/model.ts`)

Implied value follows only from the snapshot's own figures, never from a list of names:

```
implied = round( tvl_usd x category_multiple
                 x (1 + clamp(change_7d, -60, 120) / 100 x 0.6)
                 x maturity(age_days)
                 x (1 + 0.03 x min(chains - 1, 3)) )
```

- **Category multiple** — the category family's FDV/TVL band: Chain and Launchpad 0.35,
  Lending and Derivatives 0.30, Dexs 0.28, Yield/Curators/Allocators 0.22, RWA 0.18,
  Insurance/NFT/BTC 0.15, Stablecoins 0.12, Bridge/Staking 0.10, everything else 0.20.
- **Growth** — seven-day TVL change, clamped to [-60, +120]%, weighted 0.6.
- **Maturity** — rises from 0.55 at listing to 1.00 at 730 days, then eases by up to 0.15 over
  the next 1,095 days: a protocol that has run years with no token has had longer to prove no
  launch is coming. An unlisted age uses 365 days.
- **Reach** — 3% per extra chain, up to three.

The board covers the whole 40-protocol watchlist (the floor) plus the 158 other launch
candidates below it: 198 rows. Protocols whose token already trades are set aside with their
market cap, and 144 wrapped/staked/bridged products are set aside with the reason — so the
board never ranks a token that already exists as a launch still to come.

## Farm plans

Every row gets eight steps derived from the protocol's own record (category family, chains, TVL,
age): a fresh wallet, gas funding on its main chain, the family's core action with capital sized
by TVL, a second interaction, a weekly cadence, a points/quests check, a hold period, and a farm
log. Each step states what it costs and how long it takes.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

Node 22+, standard library only. `main.ts` writes `board.json`, `data.js`, copies `dashboard/`
and `screenshots/`, and writes `dossier.json` with the vendored `vendor/makefun-board.ts`.
Two runs write identical bytes.

## The dashboard

A static page, no network: `dashboard/index.html`, `app.css`, `app.js` read `data.js` beside
the page. Sortable and filterable board, a detail drawer per protocol with the model's own
inputs and the farm plan, a Live token view, a Set aside view, and the model stated in full.

Implied value is this entry's own claim from the snapshot's figures, never a price and never a
prediction that a token is issued. A protocol on the board records no token; it may still have
one the record does not carry.
