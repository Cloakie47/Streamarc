export interface ChainOption {
  id: string
  name: string
  icon: string
  fee: string
  feeUsdc: number
  circleBlockchain: string
}

export const SUPPORTED_CHAINS: ChainOption[] = [
  { id: "Arc_Testnet", name: "ARC Testnet", icon: "🔴", fee: "$0.00", feeUsdc: 0, circleBlockchain: "ARC-TESTNET" },
  { id: "Base_Sepolia", name: "Base Sepolia", icon: "🔵", fee: "$0.10", feeUsdc: 0.1, circleBlockchain: "BASE-SEPOLIA" },
  { id: "Arbitrum_Sepolia", name: "Arbitrum Sepolia", icon: "🔷", fee: "$0.10", feeUsdc: 0.1, circleBlockchain: "ARB-SEPOLIA" },
  { id: "Avalanche_Fuji", name: "Avalanche Fuji", icon: "🔺", fee: "$0.10", feeUsdc: 0.1, circleBlockchain: "AVAX-FUJI" },
  { id: "Ethereum_Sepolia", name: "Ethereum Sepolia", icon: "⟠", fee: "$0.10", feeUsdc: 0.1, circleBlockchain: "ETH-SEPOLIA" },
  { id: "Optimism_Sepolia", name: "OP Sepolia", icon: "🔴", fee: "$0.10", feeUsdc: 0.1, circleBlockchain: "OP-SEPOLIA" },
  { id: "Polygon_Amoy_Testnet", name: "Polygon Amoy", icon: "🟣", fee: "$0.10", feeUsdc: 0.1, circleBlockchain: "MATIC-AMOY" },
]
