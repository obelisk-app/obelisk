import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RelayEmojiAdminModal from "./RelayEmojiAdminModal";

const mocks = vi.hoisted(() => ({
  uploadToBlossom: vi.fn(async (file: File) => "https://cdn.example/" + file.name),
  publishRelayEmojiSet: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/blossom", () => ({
  uploadToBlossom: (...args: [File]) => mocks.uploadToBlossom(...args),
}));

vi.mock("@/lib/relay-emojis", () => ({
  publishRelayEmojiSet: (...args: unknown[]) => mocks.publishRelayEmojiSet(...args),
}));

describe("RelayEmojiAdminModal", () => {
  beforeEach(() => {
    mocks.uploadToBlossom.mockClear();
    mocks.publishRelayEmojiSet.mockClear();
    mocks.publishRelayEmojiSet.mockResolvedValue(undefined);
  });

  it("uploads a folder of images and appends normalized shortcode rows", async () => {
    render(
      <RelayEmojiAdminModal
        relayUrl="wss://relay.example"
        configuredRelays={["wss://relay.example"]}
        emojiSet={{ title: "", emojis: [], updatedAt: 0 }}
        onClose={() => {}}
      />,
    );

    const input = screen.getByTestId("relay-emoji-folder-input");
    fireEvent.change(input, {
      target: {
        files: [
          new File(["party"], "Party Parrot.webp", { type: "image/webp" }),
          new File(["wave"], "wave.png", { type: "image/png" }),
          new File(["skip"], "notes.txt", { type: "text/plain" }),
        ],
      },
    });

    await waitFor(() => {
      expect(mocks.uploadToBlossom).toHaveBeenCalledTimes(2);
      expect(screen.getByText(":party_parrot:")).toBeTruthy();
      expect(screen.getByText(":wave:")).toBeTruthy();
    });
  });

  it("filters managed emojis by shortcode", () => {
    render(
      <RelayEmojiAdminModal
        relayUrl="wss://relay.example"
        configuredRelays={["wss://relay.example"]}
        emojiSet={{
          title: "Pack",
          emojis: [
            { name: "party", url: "https://cdn.example/party.webp" },
            { name: "wave", url: "https://cdn.example/wave.webp" },
          ],
          updatedAt: 0,
        }}
        onClose={() => {}}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("party, wave, .gif"), {
      target: { value: "wave" },
    });

    expect(screen.getAllByDisplayValue("wave")).toHaveLength(2);
    expect(screen.queryByDisplayValue("party")).not.toBeInTheDocument();
    expect(screen.getByText("1 hidden by search")).toBeInTheDocument();
  });

  it("shares the current emoji set to multiple selected relays", async () => {
    render(
      <RelayEmojiAdminModal
        relayUrl="wss://relay.example"
        configuredRelays={[
          "wss://relay.example",
          "wss://relay-two.example",
          "wss://relay-three.example",
        ]}
        emojiSet={{
          title: "Pack",
          emojis: [{ name: "party", url: "https://cdn.example/party.webp" }],
          updatedAt: 0,
        }}
        onClose={() => {}}
      />,
    );

    const relayTwo = screen.getByLabelText("relay-two.example") as HTMLInputElement;
    const relayThree = screen.getByLabelText("relay-three.example") as HTMLInputElement;

    await waitFor(() => expect(relayTwo.checked).toBe(true));
    expect(relayThree.checked).toBe(false);

    fireEvent.click(relayThree);
    fireEvent.click(screen.getByRole("button", { name: "Share to 2 relays" }));

    await waitFor(() => expect(mocks.publishRelayEmojiSet).toHaveBeenCalledTimes(2));
    expect(mocks.publishRelayEmojiSet.mock.calls[0][0]).toBe("wss://relay-two.example");
    expect(mocks.publishRelayEmojiSet.mock.calls[1][0]).toBe("wss://relay-three.example");
    expect(mocks.publishRelayEmojiSet.mock.calls[0][1]).toMatchObject({
      title: "Pack",
      emojis: [{ name: "party", url: "https://cdn.example/party.webp" }],
    });
    expect(screen.getByText("Shared to 2 relays.")).toBeInTheDocument();
  });
});
