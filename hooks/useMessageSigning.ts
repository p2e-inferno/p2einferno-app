import { useCallback, useState } from "react";
import {
  getAccessToken,
  useSignMessage,
  WalletWithMetadata,
} from "@privy-io/react-auth";
import axios from "axios";
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hooks:useMessageSigning');


export function useMessageSigning(wallet: WalletWithMetadata) {
  const { signMessage: signMessageEthereum } = useSignMessage();
  const { signMessage: signMessageSolana } = useSignMessage();
  const [isClientSigning, setIsClientSigning] = useState(false);
  const [isRemoteSigning, setIsRemoteSigning] = useState(false);

  const handleClientSign = useCallback(async () => {
    setIsClientSigning(true);
    try {
      const message = `Signing this message to verify ownership of ${wallet.address}`;
      let signature;
      if (wallet.chainType === "ethereum") {
        const result = await signMessageEthereum({ message });
        signature = result.signature;
      } else if (wallet.chainType === "solana") {
        const result = await signMessageSolana({
          message,
        });
        signature = result.signature;
      }
      log.info("Message signed on client! Signature: ", signature);
    } catch (error) {
      log.error("Error signing message:", error);
    } finally {
      setIsClientSigning(false);
    }
  }, [wallet, signMessageEthereum, signMessageSolana]);

  const handleRemoteSign = useCallback(async () => {
    setIsRemoteSigning(true);
    try {
      const authToken = await getAccessToken();
      const path =
        wallet.chainType === "ethereum"
          ? "/api/ethereum/personal_sign"
          : "/api/solana/sign_message";
      const message = `Signing this message to verify ownership of ${wallet.address}`;
      const response = await axios.post(
        path,
        {
          wallet_id: wallet.id,
          message: message,
        },
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      const data = response.data;

      if (response.status === 200) {
        log.info(
          "Message signed on server! Signature: " + data.data.signature
        );
      } else {
        throw new Error(data.error || "Failed to sign message");
      }
    } catch (error) {
      log.error("Error signing message:", error);
    } finally {
      setIsRemoteSigning(false);
    }
  }, [wallet]);

  return {
    isClientSigning,
    isRemoteSigning,
    handleClientSign,
    handleRemoteSign,
  };
}
