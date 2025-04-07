const axios = require("axios");
const ethers = require("ethers");
const fs = require("fs");
const readline = require("readline");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { SocksProxyAgent } = require("socks-proxy-agent");
const {
  createWallet,
  getAddress,
  generateNewWallet,
} = require("./config/wallet");
const { askQuestion } = require("./utils/question");
const config = JSON.parse(fs.readFileSync("./config/network.json", "utf8"));
const PK_FILE = "./config/pk.txt";
const PROXY_FILE = "./config/proxy.txt";
const FAUCET_API = config.network.somnia.faucetApi;
const provider = new ethers.JsonRpcProvider(config.network.somnia.rpc);
const { SYMBOlS, logger } = require("./utils/logger");

const privateKeys = fs
  .readFileSync(PK_FILE, "utf-8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line);

async function randomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1) + min) * 1000;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// Proxy Management
function loadProxies() {
  try {
    const content = fs.readFileSync(PROXY_FILE, "utf8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && line.length > 0);
  } catch (error) {
    console.error("Error loading proxies:", error.message);
    return [];
  }
}

function getRandomProxy(proxies) {
  if (!proxies.length) return null;
  return proxies[Math.floor(Math.random() * proxies.length)];
}

function createProxyAgent(proxy) {
  if (!proxy) return null;

  if (proxy.startsWith("socks4://") || proxy.startsWith("socks5://")) {
    const proxyType = proxy.startsWith("socks5") ? "SOCKS5" : "SOCKS4";
    console.log(`Proxy ${proxyType} dari proxies.txt digunakan: ${proxy}`);
    return new SocksProxyAgent(proxy);
  }

  // Untuk proxy HTTP/HTTPS dengan atau tanpa autentikasi
  const url =
    proxy.startsWith("http://") || proxy.startsWith("https://")
      ? proxy
      : `http://${proxy}`;
  console.log(`Proxy HTTP dari proxies.txt digunakan: ${url}`);
  return new HttpsProxyAgent(url);
}

async function makeRequest(url, options = {}, retries = 3) {
  const proxies = loadProxies();
  let proxy = getRandomProxy(proxies);
  let attempt = 0;

  while (attempt < retries) {
    const agent = proxy ? createProxyAgent(proxy) : null;
    if (!proxy) {
      console.log("Tidak ada proxy yang digunakan untuk permintaan ini");
    }

    try {
      const response = await axios({
        url,
        ...options,
        timeout: 10000, // Set timeout to 10 seconds
        ...(agent && { httpsAgent: agent, httpAgent: agent }),
      });
      return response;
    } catch (error) {
      attempt++;
      if (error.code === "EAI_AGAIN") {
        console.error(
          `Kesalahan EAI_AGAIN pada percobaan ${attempt}/${retries} dengan proxy: ${
            proxy || "tanpa proxy"
          }`
        );
        if (attempt < retries) {
          console.log("Mencoba lagi dengan proxy lain...");
          proxy = getRandomProxy(proxies); // Ganti proxy untuk percobaan berikutnya
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Tunggu 2 detik sebelum retry
          continue;
        }
      }
      throw new Error(
        `Request failed setelah ${retries} percobaan${
          proxy ? " dengan proxy " + proxy : ""
        }: ${error.message}`
      );
    }
  }
}

async function claimFaucet(address, retries = 3) {
  logger.info(`Loading proxies from ${PROXY_FILE}...`);
  const proxies = loadProxies();
  logger.success(`Found ${proxies.length} proxies`);
  let attempt = 0;

  while (attempt < retries) {
    let proxy = getRandomProxy(proxies);
    const agent = proxy ? createProxyAgent(proxy) : null;

    logger.processing(`Attempt ${attempt + 1}`);
    logger.wallet(`Claiming faucet for address: ${address}`);
    logger.network(`Using proxy: ${proxy || "No Proxy"}`);

    try {
      const response = await axios({
        url: FAUCET_API,
        method: "POST",
        data: { address },
        headers: {
          accept: "*/*",
          "accept-language": "en-US,en;q=0.9",
          "content-type": "application/json",
          origin: "https://testnet.somnia.network",
          priority: "u=1, i",
          referer: "https://testnet.somnia.network/",
          "sec-ch-ua": `"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"`,
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": `"Windows"`,
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        },
        timeout: 10000,
        ...(agent && { httpAgent: agent, httpsAgent: agent }),
      });

      if (response.data.success) {
        return {
          success: true,
          hash: response.data.data.hash,
          amount: response.data.data.amount,
        };
      } else {
        logger.error("Faucet claim failed: " + JSON.stringify(response.data));
      }
    } catch (error) {
      logger.warning(`Attempt ${attempt + 1} failed: ${error.message}`);
    }

    attempt++;
    if (attempt < retries) {
      logger.processing("Retrying with a new proxy...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  return { success: false, error: "All attempts failed" };
}

async function handleClaimFaucet() {
  try {
    if (!privateKeys.length) {
      logger.error("No private keys found in the file.");
      return;
    }

    for (let i = 0; i < privateKeys.length; i++) {
      const privateKey = privateKeys[i];

      if (!privateKey) {
        logger.warning(`Skipping empty private key at index ${i + 1}`);
        continue;
      }

      const wallet = createWallet(privateKey, provider);
      logger.divider();
      logger.wallet(`Wallet ${i + 1}/${privateKeys.length}`);
      logger.result("Address", wallet.address);

      const result = await claimFaucet(wallet.address);

      if (result.success) {
        logger.success("Claim successful!");
      } else {
        logger.error(`Claim failed for ${wallet.address}: ${result.error}`);
      }

      if (i < privateKeys.length - 1) {
        logger.info("Waiting 5 seconds before the next claim...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    logger.divider();
    logger.success("🎉 Process Completed!");
  } catch (error) {
    logger.error("Unexpected error: " + error.message);
  }
}

async function handleSendToken() {
  try {
    logger.divider();
    logger.info("🔢 Masukkan detail transaksi");

    const amountPerTx = parseFloat(
      await askQuestion("💰 Jumlah token per transaksi: ")
    );
    const txPerAccount = parseInt(
      await askQuestion("🔄 Berapa kali TX per akun: ")
    );

    const minDelay = 10; // Minimum delay dalam detik
    const maxDelay = 30; // Maksimum delay dalam detik

    if (
      isNaN(amountPerTx) ||
      isNaN(txPerAccount) ||
      amountPerTx <= 0 ||
      txPerAccount <= 0
    ) {
      logger.error("Input tidak valid! Masukkan angka lebih dari 0.");
      return;
    }

    logger.processing(
      `🚀 Memulai transaksi, setiap akun akan melakukan ${txPerAccount} transaksi.`
    );

    for (let txRound = 1; txRound <= txPerAccount; txRound++) {
      logger.divider();
      logger.processing(`🔄 --- Putaran transaksi ke-${txRound} ---`);

      for (let i = 0; i < privateKeys.length; i++) {
        const provider = new ethers.JsonRpcProvider(config.network.somnia.rpc);
        const wallet = new ethers.Wallet(privateKeys[i], provider);
        const newWallet = ethers.Wallet.createRandom();

        logger.wallet(`Wallet ke-${i + 1}/${privateKeys.length}`);
        logger.result("Alamat Pengirim", wallet.address);
        logger.result("Alamat Penerima", newWallet.address);

        const balance = await provider.getBalance(wallet.address);
        const amountInWei = ethers.parseEther(amountPerTx.toString());

        if (balance < amountInWei) {
          logger.warning(
            `Saldo tidak cukup di wallet ${wallet.address}, transaksi dilewati.`
          );
          continue;
        }

        try {
          const tx = await wallet.sendTransaction({
            to: newWallet.address,
            value: amountInWei,
          });

          logger.success(`Transaction sent: ${tx.hash}`);
          logger.info(
            `🔗 View on explorer: ${config.network.somnia.explorer}/tx/${tx.hash}`
          );

          await tx.wait();
        } catch (error) {
          logger.error(
            `Gagal mengirim token dari ${wallet.address}: ${error.message}`
          );
          continue;
        }

        const delay = await randomDelay(minDelay, maxDelay);
        logger.processing(
          `⏳ Menunggu ${delay / 1000} detik sebelum transaksi berikutnya...`
        );
      }

      logger.success(`--- Putaran transaksi ke-${txRound} selesai ---`);
    }

    logger.divider();
    logger.success("🎉 Semua transaksi telah selesai!");
  } catch (error) {
    logger.error(`❌ Error: ${error.message}`);
  }
}

async function mainMenu() {
  while (true) {
    logger.divider();
    logger.info("🚀 Main Menu");
    logger.info("1️⃣  💧 Claim Faucet");
    logger.info("2️⃣  💸 Send Token");
    logger.info("3️⃣  ❌ Keluar");

    const choice = await askQuestion("\n👉 Masukkan pilihan (1/2/3): ");

    switch (choice.trim()) {
      case "1":
        logger.processing("💦 Memulai proses klaim faucet...");
        await handleClaimFaucet();
        break;
      case "2":
        logger.processing("📤 Memulai proses pengiriman token...");
        await handleSendToken();
        break;
      case "3":
        logger.info("👋 Keluar dari program. Sampai jumpa!");
        process.exit(0);
      default:
        logger.warning("⚠️ Pilihan tidak valid, silakan coba lagi.");
    }
  }
}


// Start the application
console.log("Starting Multi-Network Bot...");
mainMenu().catch(console.error);
