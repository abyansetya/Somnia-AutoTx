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

  const [auth, hostPort] = proxy.includes("@")
    ? proxy.split("@")
    : [null, proxy];
  const [host, port] = hostPort ? hostPort.split(":") : proxy.split(":");

  if (proxy.startsWith("socks4://") || proxy.startsWith("socks5://")) {
    const proxyType = proxy.startsWith("socks5") ? "SOCKS5" : "SOCKS4";
    console.log(`Proxy ${proxyType} dari proxies.txt digunakan: ${proxy}`);
    return new SocksProxyAgent(
      `socks${proxy.startsWith("socks5") ? 5 : 4}://${proxy.replace(
        /^socks[4-5]:\/\//,
        ""
      )}`
    );
  }
  console.log(`Proxy HTTP dari proxies.txt digunakan: ${proxy}`);
  return new HttpsProxyAgent(`http://${proxy}`);
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
  console.log(`Loading proxies from ${PROXY_FILE}...`);
  const proxies = loadProxies();
  console.log(`Found ${proxies.length} proxies`);
  let attempt = 0;

  while (attempt < retries) {
    let proxy = getRandomProxy(proxies);
    const agent = proxy ? createProxyAgent(proxy) : null;

    console.log(
      `Attempt ${attempt + 1}: Claiming faucet for ${address} using proxy: ${
        proxy || "No Proxy"
      }`
    );

    try {
      const response = await axios({
        url: FAUCET_API,
        method: "POST",
        data: { address },
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
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
        console.log("❌ Faucet claim failed: ", response.data);
      }
    } catch (error) {
      console.log(`⚠️ Attempt ${attempt + 1} failed: ${error.message}`);
    }

    attempt++;
    if (attempt < retries) {
      console.log("🔁 Retrying with a new proxy...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  return { success: false, error: "All attempts failed" };
}

async function handleClaimFaucet() {
  try {
    if (!privateKeys.length) {
      console.log("No private keys found in the file.");
      return;
    }

    for (let i = 0; i < privateKeys.length; i++) {
      const privateKey = privateKeys[i];

      if (!privateKey) {
        console.log(`Skipping empty private key at index ${i + 1}`);
        continue;
      }

      const wallet = createWallet(privateKey, provider);
      console.log(`\nWallet ${i + 1}/${privateKeys.length}`);
      console.log(`Address: ${wallet.address}`);

      const result = await claimFaucet(wallet.address);

      if (result.success) {
        console.log(`Claim successful! TX Hash: ${result.hash}`);
        console.log(
          `Amount: ${ethers.formatEther(result.amount)} ${
            config.network.somnia.symbol
          }`
        );
      } else {
        console.log(`Claim failed for ${wallet.address}: ${result.error}`);
      }

      // Tambahkan delay 5 detik agar tidak terlalu cepat
      if (i < privateKeys.length - 1) {
        console.log("Waiting 5 seconds before the next claim...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    console.log("\nProcess Completed!");
  } catch (error) {
    console.log("Error:", error.message);
  }
}

async function handleSendToken() {
  try {
    const amountPerTx = parseFloat(
      await askQuestion("Jumlah token per transaksi: ")
    );
    const txPerAccount = parseInt(
      await askQuestion("Berapa kali TX per akun: ")
    );
    const minDelay = 10; // Minimum delay dalam detik
    const maxDelay = 30; // Maksimum delay dalam detik

    if (
      isNaN(amountPerTx) ||
      isNaN(txPerAccount) ||
      amountPerTx <= 0 ||
      txPerAccount <= 0
    ) {
      console.error("Input tidak valid! Masukkan angka lebih dari 0.");
      return;
    }

    console.log(
      `\nMemulai proses transaksi, setiap akun akan melakukan ${txPerAccount} transaksi.\n`
    );

    for (let txRound = 1; txRound <= txPerAccount; txRound++) {
      console.log(`\n--- Memulai putaran transaksi ke-${txRound} ---`);

      for (let i = 0; i < privateKeys.length; i++) {
        const provider = new ethers.JsonRpcProvider(config.network.somnia.rpc);
        const wallet = new ethers.Wallet(privateKeys[i], provider);
        const newWallet = ethers.Wallet.createRandom();

        console.log(`Generated recipient address: ${newWallet.address}`);

        // Pastikan saldo cukup sebelum mengirim transaksi
        const balance = await provider.getBalance(wallet.address);
        const amountInWei = ethers.parseEther(amountPerTx.toString());

        if (balance < amountInWei) {
          console.error(
            `Saldo tidak cukup di wallet ${wallet.address}, transaksi dilewati.`
          );
          continue;
        }

        try {
          const tx = await wallet.sendTransaction({
            to: newWallet.address,
            value: amountInWei,
          });

          console.log(`Transaction sent: ${tx.hash}`);
          console.log(
            `View on explorer: ${config.network.somnia.explorer}/tx/${tx.hash}`
          );

          await tx.wait();
        } catch (error) {
          console.error(
            `Gagal mengirim token dari ${wallet.address}:`,
            error.message
          );
          continue;
        }

        if (privateKeys.length > 1 && i < privateKeys.length - 1) {
          const delay = await randomDelay(minDelay, maxDelay);
          console.log(
            `Menunggu ${delay / 1000} detik sebelum transaksi berikutnya...`
          );
        } else if (privateKeys.length === 1) {
          const delay = await randomDelay(minDelay, maxDelay);
          console.log(
            `Menunggu ${delay / 1000} detik sebelum transaksi berikutnya...`
          );
        }
          
      }

      console.log(`\n--- Putaran transaksi ke-${txRound} selesai ---`);
    }

    console.log("\nSemua transaksi telah selesai!");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

async function mainMenu() {
  while (true) {
    console.log("\nPilih aksi yang ingin dilakukan:");
    console.log("1. Claim Faucet");
    console.log("2. Send Token");
    console.log("3. Keluar");

    const choice = await askQuestion("Masukkan pilihan (1/2/3): ");

    switch (choice.trim()) {
      case "1":
        console.log("\nMemulai proses klaim faucet...");
        await handleClaimFaucet();
        break;
      case "2":
        console.log("\nMemulai proses pengiriman token...");
        await handleSendToken();
        break;
      case "3":
        console.log("Keluar dari program.");
        process.exit(0);
      default:
        console.log("Pilihan tidak valid, silakan coba lagi.");
    }

    // Remove recursive call to prevent menu duplication
    // await mainMenu();
  }
}

// Start the application
console.log("Starting Multi-Network Bot...");
mainMenu().catch(console.error);
