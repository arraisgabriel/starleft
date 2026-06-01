# LNS: Live News Stream
Let's add a news feed feature that appears on the main menu and optionally in-game screen (toggled with a button on top menu right)

This is a new game module (js file).

The feed will fetch (in the browser) the news from diffrent public news feed apis to show in a news channel ticker presented in a cybperunk manner.
On main menu the news ticker show on the Lower Third as a button styled stripe that crosses 100% of the viewport width and scales vertically considering the viewport height

When in game the news feed appears on top (below the top menu) in a stripe styled like the buttons with small (but readable) stream of news text.

Try to use these APIs to fetch the news on the browser. Separate their parsing in diffrent functions. Moderate the cpu load, it can take long and we want performance here.

https://feedx.net/rss/ap.xml

https://feeds.bbci.co.uk/news/world/rss.xml

https://www.euronews.com/rss

https://www.lemonde.fr/en/rss/une.xml

https://time.com/feed/

The feed stream panel must render a loading status text `Loading ...` while there are no news received