export interface ChainOption {
  id: string
  name: string
  icon: string
  fee: string
  feeUsdc: number
  domain: number
  usdcAddress: string
  circleBlockchain: string
  nativeToken: string
  finalitySeconds: number
}

export const SUPPORTED_CHAINS: ChainOption[] = [
  { id: "Arc_Testnet", name: "ARC Testnet", icon: "🔴", fee: "$0.00", feeUsdc: 0, domain: 26, usdcAddress: "0x3600000000000000000000000000000000000000", circleBlockchain: "ARC-TESTNET", nativeToken: "ETH", finalitySeconds: 1 },
  { id: "Base_Sepolia", name: "Base Sepolia", icon: "🔵", fee: "$0.10", feeUsdc: 0.10, domain: 6, usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", circleBlockchain: "BASE-SEPOLIA", nativeToken: "ETH", finalitySeconds: 900 },
  { id: "Avalanche_Fuji", name: "Avalanche Fuji", icon: "🔺", fee: "$0.10", feeUsdc: 0.10, domain: 1, usdcAddress: "0x5425890298aed601595a70AB815c96711a31Bc65", circleBlockchain: "AVAX-FUJI", nativeToken: "AVAX", finalitySeconds: 8 },
  { id: "Ethereum_Sepolia", name: "Ethereum Sepolia", icon: "⟠", fee: "$0.10", feeUsdc: 0.10, domain: 0, usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", circleBlockchain: "ETH-SEPOLIA", nativeToken: "ETH", finalitySeconds: 900 },
]
