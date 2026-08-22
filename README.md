<div align="center">

# Vox

### Real-time translation, beautifully focused.

Four independent tabbed translation workspaces for Chinese, English, Spanish, and French — in one calm, editorial interface.

[Try the demo](https://bobby-eats-pizza.github.io/vox-realtime-translation/) · [Report a bug](https://github.com/bobby-eats-pizza/vox-realtime-translation/issues) · [Request a feature](https://github.com/bobby-eats-pizza/vox-realtime-translation/issues)

</div>

---

## Why Vox?

Most translation tools optimize for one quick conversion. Vox is designed for multilingual work: four independent language-to-language tabs that keep different conversations, drafts, or comparisons ready without cluttering the screen.

- **Four independent tabs** — each workspace preserves its own source, target, input, and result.
- **Live translation** — results update shortly after you stop typing.
- **Privacy-minded** — uses Chrome's on-device Translator API when available.
- **Broad fallback** — gracefully uses cloud translation when a local model is unavailable.
- **Useful details** — language swapping, copy, speech playback, character counts, and dark mode.
- **No build step** — plain HTML, CSS, and JavaScript. Clone it and open it.

## Supported languages

| Code | Language | Native name |
| :--- | :--- | :--- |
| CHN | Chinese | 中文 |
| ENG | English | English |
| ESP | Spanish | Español |
| FRA | French | Français |

Every supported language can translate to every other supported language.

## How translation works

```text
Your text
   │
   ├─ Supported desktop Chrome + local model → On-device translation
   │
   └─ Other browsers / unavailable model     → Cloud fallback
```

Vox first checks for the browser-native [`Translator`](https://developer.mozilla.org/en-US/docs/Web/API/Translator) interface. If it is unavailable, Vox falls back to the public [MyMemory](https://mymemory.translated.net/doc/spec.php) translation service. The fallback has usage limits and should be replaced with a production translation provider for high-volume deployments.

## Run locally

No dependencies are required.

```bash
git clone https://github.com/bobby-eats-pizza/vox-realtime-translation.git
cd vox-realtime-translation
python3 -m http.server 8080
```

Then visit [`http://localhost:8080`](http://localhost:8080). Serving through localhost is recommended because browser-native translation requires a secure context.

## Project structure

```text
.
├── index.html   # Semantic page structure and metadata
├── styles.css   # Responsive editorial design and themes
├── script.js    # Translation, state, speech, copy, and theme logic
└── README.md
```

## Roadmap

- [ ] Add more language packs
- [ ] Save favorite language pairs locally
- [ ] Add translation history with privacy controls
- [ ] Add keyboard navigation between desks
- [ ] Support a configurable production translation provider

## Contributing

Small, focused contributions are welcome. Fork the repository, create a feature branch, make and test your changes, then open a pull request with a clear description and screenshots for visual changes.

## Privacy and accuracy

When the browser-native model is active, translation happens on the device. With the cloud fallback, text is sent to MyMemory for translation. Avoid entering sensitive information when using the fallback. Machine translation can miss tone, idiom, and context; use a fluent reviewer for consequential text.

## License

Released under the [MIT License](LICENSE).

<div align="center"><sub>Made for words that matter.</sub></div>
