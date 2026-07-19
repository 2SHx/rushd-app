# Investing for Programmers — 100% Verbatim Raw Text Transcript

> **Source**: *Investing for Programmers* by Stefan Papp (Manning MEAP)
> **Contents**: Complete 477-page verbatim text transcript extracted from the manuscript.

---

## Page 3
Investing for Programmers
1. welcome
2. 1_Investing_smart
3. 2_Investment_essentials
4. 3_Collecting_data
5. 4_Growth_portfolios
6. 5_Income_portfolios
7. 6_Building_an_asset_monitor
8. 7_Risk_management
9. 8_AI_for_financial_research
10. 9_AI_agents
11. 10_Charts_and_technical_analysis
12. 11_Algorithmic_trading
13. 12_Private_equity:_Investing_in_startups
14. 13_The_road_goes_ever_on_and_on
15. index

---

## Page 4
welcome
Dear Reader,
I want to share a secret with you. Investing for Programmers is the product of
a revelation I had during one of the most monotonous yet lucrative periods of
my career. At the time, I was working as a contractor for a client, slogging
through tedious work while enjoying a fantastic pay rate. As I calculated how
many more months I would need to keep at it before I could retire and
dedicate myself to the things I love, a question kept nagging me: Was there a
way to accelerate this timeline?
I had been investing for years, sometimes with intense focus, other times less
so, depending on life’s demands. But during this project, I realized something
powerful: if I could achieve even slightly better returns by leveraging my
programming and analytical skills, the finish line of financial freedom could
come much sooner.
As programmers, we already bring so much to the table. Python has become
the go-to language for data analysis, and even if your expertise lies in other
languages, Python’s versatility and simplicity make it accessible. And as I
dug deeper, I discovered how programming could transform investing. To
analyze stocks effectively, you need to gather data from diverse sources,
compare insights, and construct a thesis grounded in facts and logic. If
you’ve worked in tech, you’ve likely seen firsthand how data-driven
decisions create value for clients and employers. Why not use those same
skills to create value for yourself?
Over the years, I’ve taught myself how to blend programming with investing,
and it has profoundly changed my approach to wealth-building. This book is
my way of sharing that journey with you—so you can shorten your own path
to financial freedom. You’ll learn how to find the right stocks, develop an
investment thesis, and use programming to gather and analyze the data that
supports your ideas.

---

## Page 5
By the end of this book, my hope is that you’ll see the stock market not as a
mysterious force but as an opportunity waiting to be unlocked with the tools
you already know. Together, we’ll merge the logical precision of
programming with the art of investing so you can take control of your
financial future.
Please feel free to share your questions and comments in the liveBook
Discussion forum.
Let’s get started on this exciting journey.
Warm regards,
—Stefan Papp
In this book
welcome 1 Investing smart 2 Investment essentials 3 Collecting data 4
Growth portfolios 5 Income portfolios 6 Building an asset monitor 7 Risk
management 8 AI for financial research 9 AI agents 10 Charts and technical
analysis 11 Algorithmic trading 12 Private equity: Investing in startups 13
The road goes ever on and on

---

## Page 6
1 Investing smart
This chapter covers
A simplified model of the financial market and securities
An overview of investment strategies
Potential advantages and traits of programmers for investing
For many, money is the gateway to freedom—freedom to live the life we
want or to escape the daily grind of earning it. While a sound investment
strategy can grow our wealth, diving into the financial world can feel
daunting. For many, opening a brokerage account feels like stepping into an
alien landscape with unfamiliar rules. The horror stories of bold decisions
gone wrong and the skepticism toward commission-hungry financial advisors
don’t help. Sometimes, even a trip to Las Vegas feels like a better deal—you
might lose the same amount, but at least you’ll enjoy the ride.
This book is here to change that. It’s designed to help you craft an investment
strategy tailored to your risk appetite and financial goals. And it’s explicitly
written for programmers, who, as you’ll discover, possess a unique skill set
that makes them well-suited for mastering the art of investing. But before we
connect the dots between coding and compounding, we’ll start with the
foundations. Let’s dive in.
Investopedia defines an investment as “an asset or item acquired with the
goal of generating income or appreciation.”(
https://www.investopedia.com/terms/i/investment.asp) These two objectives
are easily translated into layperson terms and exemplified: An investor
purchases an apartment to generate income by renting it to a tenant, and sells
it at a higher price for a profit or appreciation. These monetization
opportunities are trivial in their most abstract form; however, making sound
investment decisions can be challenging. An investor might buy an
apartment, and for some reason, the real estate prices on the market fall
afterward. If he rents it to a tenant, the investor might learn that he achieves
smaller returns than if he had invested the money in a different asset, like a

---

## Page 7
company stock. The complexity is the large number of parameters that affect
whether a decision is economically sound or flawed.
This book is called Investment for Programmers. We understand
programmers as everyone who understands how to write software
applications to analyze data, such as software engineers, data scientists,
DevOps engineers, and programming enthusiasts who do not earn money in
the tech industry. What matters is that you have an analytical mindset and are
eager to use your analytical programming skills to make better investment
decisions or to build a software product that targets investors. In this book,
we will use analogies and examples known to programmers to illustrate the
world of investment and its environment.
To develop solutions, we need to understand more about what we want to
explore with code. The definition of investment still needs to indicate how
investors make money. When discussing investment, some might think of
today’s almost obsolete floor traders, who wildly agitated other traders while
standing in a trading room of an exchange, often called the pit. By shouting
commands and giving signs to other parties, they try to get the best price for
financial assets. The documentary Floored shows how computers have almost
wholly wiped out floor traders. Still, for many of us, it is hard to imagine that
the investment legend Warren Buffett and his partner, the late Charlie
Munger, are sitting in front of a screen, programming algorithms in pairs to
beat the market with better algorithms. This also applies to well-known
investors who have reached a respectable age, such as George Soros, Carl
Icahn, Ray Dalio, or the late Jim Simons. Many of them were already
investing when Fairchild Semiconductor was founded, which, for many, was
the start of Silicon Valley. These highly respectable senior investors are
sharp-witted but not computer whiz-kids.
Note
Computer algorithms are responsible for nearly 80% of the trading volume in
U.S. equity markets. Thus, buying and selling assets has become an
opportunity for people who can optimize decision-making through
algorithms.
Some experts might call Warren Buffett the most successful investor, as he is

---

## Page 8
the wealthiest person who made his fortune through investments. Still,
something makes the Oracle of Omaha unique (besides the fact that, as a rich
person, he stays humble and still leads a simple life). Many anecdotes tell
how he started investing at eleven years old and has made money for over 80
years. This is a long time, especially if we aggregate compounding effects
that, in simplified terms, remind us that we can also make profits from profits
that we made in the years before. Jim Simons is often associated with being
among the first to dedicate himself entirely to making the most intelligent
investment decisions based on mathematical models. Jim Simons may have
never become as rich as Warren Buffett, but he made higher yearly returns in
his shorter timeframe as an investor, as the chart in table 1.1 shows. The next
generation of top investors may consist only of people with a strong
analytical background.
Table 1.1 Comparing Jim Simons with other investors according to the book The Man Who
Solved the Market
Investor Key fund/vehicle Period Annualized returns
Jim Simons Medallion Fund 1998-2018 39.1%
George Soros Quantum Fund 1969-2000 32%
Steven Cohen SAC 1992-2003 30%
Peter Lynch Magellan Fund 1977-1990 29%
Warren Buffet Berkshire Hathaway 1965-2018 20.5%
Ray Dalio Pure Alpha 1991-2018 12%
As Jim Simons opened the door to more analytical approaches to investment
decisions, it is time to ask what we need to make wise investment decisions.
One precondition to answer this question is to have a model of the
environment we want to analyze. The initial version of our model of an
investment market may be simple, but it will get more complex with time as
we study exceptional cases within the environment. Therefore, when we
analyze the details, we will start small and refine this model in the upcoming
chapters. We will occasionally translate concepts from the finance world to
programmer terminology. One friend from my university had a standard

---

## Page 9
footer with an email quote saying, “Don’t worry. In the end, it is all zeros and
ones.” In the finance world, these zeros and ones are all about making higher
returns and avoiding risks. Therefore, let’s explore the fields with Douglas
Adams' advice: Don't panic!
1.1 A model of the investment
We defined an investment as an asset or item acquired to generate income or
appreciation over time. We will discuss more concrete assets such as stocks,
bonds, or real estate, but let’s define an asset more abstractly. An asset is any
resource with financial value controlled by a company, country, or individual.
If we think like programmers, we see an asset as an abstract concept with
different implementations. In programmer’s terms, we can also claim that
“generating income” and “generating appreciation” are already defined with
assets, but their concrete implementation might vary between assets. Assets
range from stocks to commodities and include things we do not immediately
consider, such as intellectual property. As programmers, we might model the
idea of assets in code, as shown below. One abstract asset may have many
different concrete implementations. Please note that the mentioned assets
below in figure 1.1 are just a tiny subset of all available assets.
Figure 1.1 A model of assets

---

## Page 10
Let’s see what generating income or appreciation could look like in a
concrete asset that is not a financial security, to outline that investments are
not reduced to one domain. Suppose an art lover who claims to have severe
financial problems offers us his collection of paintings by Ivan Aivazovsky at
a discount price. After buying these paintings, we can rent them to museums
to generate an income. If we find a buyer who wants to purchase these
pictures at a higher price, we profit through capital appreciation. We can see

---

## Page 11
some similarities to real estate investments.
The critical question is whether purchasing an Aivazovsky collection is a
good investment decision. Maybe the seller's talk of being broke is just a
smokescreen; in reality, the offered price for the pictures is over the market
price (assuming that most readers will not have enough expertise to know
beforehand what fair prices are for the work of this painter of the romantic
era). It could be risky to look into the eyes of the seller and let our gut feeling
decide if he is broke and if we can make an exceptional deal by buying these
paintings. However, even if we heard the name of this painter for the first
time, we can analyze the prices of Aivazovsky’s pictures (and those of
similar painters) in previous auctions. With sufficient data, we could build a
linear regression model using various input parameters. We can also identify
trends and sentiments by analyzing search engines or social media channels
to discover how art lovers talk about Aivazovsky and his era. If we start
thinking entrepreneurially, we could even go deeper and create applications
that forecast prices for different art pieces and monetize this as a product for
wealthy art lovers who want to prepare for upcoming art auctions.
Note
The highest price a painting of Aivazovsky sold for was $5.2m, which is
small compared to $450m, when a member of the Al Saud family purchased
the Leonardo da Vinci painting Salvador Mundi in 2017. Although selling art
is not the topic of this book, this example underlines that analysts who can
predict the sale price of any asset can make a fortune.
Algorithms that help us to understand whether painters in the Romantic era
are becoming more prevalent do not help much with financial securities
unless we consider purchasing stock in a public company that deals with art
trading. This means every asset (here in terms of investment domains) needs
its model, and our goal is to create one for the financial market to understand
which data we must look for
1.1.1 A model of financial assets
Suppose we have 1000 USD and decide to purchase financial securities. One

---

## Page 12
friend may recommend buying stocks. He might advise that this form of
security has higher returns. Another friend favors bonds instead, and she
reasons that they have lower risk. With that, we have identified the two most
important parameters. One quantifies the amount of money we might gain,
and the other is the probability of losing money. We will also learn that these
two parameters are often correlated; the more risk you are willing to take, the
more chances you have for higher returns (and higher losses).
While risks and returns may be the primary decision criteria, these statements
do not tell us anything about what we buy. By buying stocks, we purchase
one tiny part of a company. At the time of writing, Apple had 15,509,763,000
shares outstanding. Buying one share of Apple means you own
0.000000006447552% of Apple. Stock is ownership, or as most people call
it, equity. We could also refer to stock ownership as public equity in contrast
to private equity, which is the ownership of a company not listed on the stock
exchange.
Note
Investopedia gives an overview of Apple’s shareholders at
https://www.investopedia.com/articles/markets/120115/top-5-apple shareholders.asp. The largest individual shareholder holds close to 4.5
million shares, but institutional investors such as the Vanguard Group or
BlackRock hold more than one billion shares each.
The price of the shares is defined by supply and demand. If the company does
well, more investors will eventually consider buying more shares, and the
share price will increase. Every stock investor's dream is to be the first to find
out that a company is doing well, and many indicators confirm that the stock
price will soar (if you are also ready to bet against the market using shorts,
you are happy as well to be the first to learn that one company is doing
poorly). What makes the stock market complex is that it is not just the
performance of a single company that decides if investors are willing to buy
or sell stocks. Also, other factors, such as geopolitical decisions, affect the
stock market.

---

## Page 13
Shares and stocks share a similar terminology, which often overlaps. Taken
and adjusted from Investopedia’s definition, the following definition might
define it once and for all: As an investor, you can invest in stocks. When you
do that, you purchase shares of the company’s stock through a brokerage
account..
Let’s agree on the simplest form of a model of the financial markets in which
investors purchase shares through a broker who holds them on their behalf. In
trades, an investor mostly buys and sells more than one share. You can also
have a negative number of shares in your portfolio; shorting will be explained
later in more detail. To summarize, your security portfolio is the sum of the
securities (stocks, bonds, options, etc.) you own; in other words, a portfolio
consists of one or more securities that can be long or short. If a stock, for
instance, is higher than its purchase price, you have an unrealized gain until
you sell it to make it a permanent gain. The same logic applies to unrealized
and permanent losses.
Some stocks provide income by rewarding investors with a small sum per
share they own, called a dividend. The payout intervals differ per stock, such
as monthly, quarterly, or annually. At the time of writing, for instance, Apple
pays 1 USD per share per year (the purchase price of a share is around 190
USD). As a rule of thumb, companies will try not to reduce the amount of
money paid per share, as for many investors it is attractive to invest in
companies that gradually increase the amount of cash per share.
Are dividends a good source of income? It depends. The indicator dividend
rate is a percentage of annual gains. In the case of Apple, it is 0.53%. A
reference for a risk-free investment is 10-year US Government bonds, which
provide more than this. At the time of writing, the interest rate was around
4.5%.
Note
The basic assumption behind calling US government bonds risk-free is the
belief that the US government will always honor its debt obligations and will
not default. This convention has become standard practice in finance.
However, describing such assets as extremely low risk would be more
accurate since, theoretically, even the US government could default.

---

## Page 14
Therefore, investing in Apple solely for dividend income is not wise.
Considering that inflation leads to a devaluation of money that is likely above
0.53%, an investor loses value if they ignore possible capital gains. Many
companies have different strategies regarding dividends. A so-called dividend
king, a stock that pays comparatively high dividends, will have a higher
annual return.
Note
Many developers dream of retiring early, making a lot of money through
projects, and investing this money in dividend stocks and bonds to build up
passive income. In this book, we focus on how to analyze stocks using
programming skills, but we will add some tips in some sections if they relate
to the topics in the text.
A bond is an IOU. You can lend money (in financial jargon called principal)
to entities like governments or companies and receive continuous interest
payments (coupons). As governments in developed countries rarely go
bankrupt, many financial advisors consider government bonds a safe
investment. Still, as we have many different bond issuers, such as other
government entities or companies, each issued bond faces different risks.
Credit ratings like Moody’s or Standard & Poor’s help investors decide about
risk. Unlike perpetual bonds, bonds have a maturity date at which the bond
owner gets their principal repaid.
Savvy investors diversify risks by not putting all their eggs in one basket. For
that reason, investment companies bundle multiple securities and sell them as
a fund. Funds follow an investment strategy. For example, they can consist of
securities:
- mirroring a stock market index (for example, a fund mirrors the S&P 500 Index, which tracks the 500 largest companies on the US stock exchange, such as the Vanguard S&P 500 ETF or Exchange-traded Fund),
- representing a specific industry (for example, a fund consists only of constituents from the information technology sector, such as the Vanguard Information Technology ETF),
- bundling stocks from emerging markets (for example, a fund invests only in emerging markets, such as the Vanguard FTSE Emerging Market ETFs).

---

## Page 15
Exchange-traded funds (ETFs) are funds that individual investors can buy.
For investors who plan to buy securities, exchange-traded funds are a less
risky form of investment, as an experienced portfolio manager decides which
stocks are in the fund (strictly speaking, ETFs can be managed by algorithms
that rebalance portfolios automatically). However, ETFs do not come for
free: Every ETF has a small maintenance fee. Therefore, buying ETFs is
more costly than purchasing these stocks directly on the stock market.
In the example above, the ETFs of Vanguard are taken as an example. Many
asset management and investment companies offer ETFs to clients; Vanguard
is just one of many. Other famous examples are BlackRock, Fidelity
Investments, and Charles Schwab. ETFs are traded like stocks, which makes
them easy for private investors to acquire. ETFs are also called pooled
investment vehicles. Other pooled investment funds are mutual funds and
hedge funds. Mutual funds are like ETFs, managed by professional portfolio
managers and similarly heavily regulated. Unlike ETFs, however, Mutual
funds settle after a trading day, when the market has closed.
While ETFs and mutual funds target retail investors, a hedge fund is often
based on a far more aggressive investment strategy and is usually sold to a
smaller audience: wealthy individuals and institutions with a lot of money.
With hedge funds comes power and influence. Many hedge funds invest in
companies in difficult times. By acquiring a large percentage of its stock,
they can influence the company's future strategy.
Tip
George Soros’s Quantum Fund challenged governments and central banks in
1992, almost bringing down the Pound, which underlines hedge funds’
power. To learn more about this moment, follow up on this article:
https://www.investopedia.com/ask/answers/08/george-soros-bank-of-england.asp.
Besides owning equity or borrowing money, there are more options (no pun
intended; we look at options as a financial asset later). You can also benefit
from currency exchange rates, also called Forex.

---

## Page 16
Countries have their state currency. The exchange rate between these assets is
dynamic. One day, the Euro may exchange at a better rate against the dollar,
and another day, it may exchange at a worse rate. Investors in the foreign
currency market look for signals in the financial market.
Note
Fiat money is often used in the crypto community to differentiate between
money issued by central banks and cryptocurrency. Strictly speaking, fiat
money is a government-issued currency not backed by a physical commodity.
Until 1971, the U.S. dollar was backed by gold, and the term fiat money is a
way to differentiate it from the Bretton Woods Agreement of 1944, where
gold was the basis for the U.S. dollar. Therefore, if we use the term money,
we refer to traditional money issued by central banks, which some crypto
enthusiasts would call fiat money.
For many, cryptocurrency is the most challenging asset to understand. Before
we can understand the value of crypto, we need to differentiate between
blockchain and cryptocurrency. Blockchain is the technology that enables
users to store growing lists of records (blocks) that are securely linked
together via cryptographic hashes. Blockchain has many applications in
various fields beyond being a digital currency.
The value proposition of cryptocurrency is to enable two parties to transfer
value without involving a third party. A third party must be engaged if Person
A wants to send money to Person B. The third party can be a bank or a
payment service. Bank transfers depend on opening times unless they offer
24/7 instant payment. If Person A wants to send cryptocurrency to Person B,
he can also do that at 3 a.m. on Sunday, and the recipient often has the
transferred funds after a few seconds.
Note
Many people with experience with international bank transfers may have
faced challenges, such as delayed transfers and high transfer fees. For them,
cryptocurrency is a powerful alternative, as the recipient often receives it
within a few minutes.

---

## Page 17
Critics often argue that cryptocurrency has no intrinsic value. Many tokens,
such as BTC, ETH, SOL, and ADA, are on the market, and it is difficult for
many to understand the detailed differences between them. While they create
returns, the crypto industry is complex and very abstract. Many
abbreviations, such as DAO, Web3, and NFT, and domain-specific jargon,
such as staking, smart contracts, and chain explorers, do not make it easier to
understand what crypto provides to an average individual. In chapter eight,
we explore the crypto market in more detail.
As the last financial assets to be introduced, derivatives are, strictly speaking,
not assets but purchased rights to buy or sell assets. The value of a derivative
is derived from the asset, hence the name. Imagine a farmer negotiates a deal
in spring with someone who needs wheat in autumn. They can settle on a
price in advance, which equalizes risks for both. Supply and demand will
affect the market price of wheat in autumn. Imagine a bad harvest due to
terrible weather in summer. As there is not much grain available, wheat will
be expensive. You made a good deal if you locked in an agreed price with a
farmer who has not lost his harvest in summer. But what happens if the
weather is perfect, and farmers can harvest more grain than usual? If the
wheat price is low, the farmer who negotiated a better price beforehand made
a good deal.
Compare options in an analogy with movie tickets. Imagine a friend telling
you about a fantastic James Bond movie with Sean Connery that will be
shown on Saturday at 8:00 p.m. Without hesitating, you quickly purchase two
tickets for yourself and your date, who loves James Bond movies. You
realize too late that you have misheard. The movie theatre does not show
Thunderball on Sunday; instead, they show a movie called Thunderpants.
Looking up this movie on IMDB, it turns out not to be the best to watch with
a date.
Strictly speaking, a ticket is the right to watch a movie at a given time and
place in a reserved seat. Some individuals feel obligated to watch a film if
they have already purchased the tickets; they think their money is lost if they
miss the movie for which they spent money (even if the movie is horrible).
For others, going to the film on Saturday is just an option. They might decide
whether to “call” this option (to use finance jargon). If it is a better idea to
have a romantic dinner somewhere, missing the movie is not seen as a loss.
Again, we can think like economists and imagine selling our Thunderpants
tickets to the highest bidders and gaining capital appreciation.

---

## Page 18
Many compare options with insurance. Let’s say you buy a stock for 200
USD and are very worried that the stock might plummet. You decide to
purchase an option for 2 USD to sell your stock for 180 USD. The call date,
when you can execute the option, is the end of the year. At the end of the
year, the stock had plummeted to 100 USD. You use your purchased right to
sell it for 180. You took a 22 USD loss, including the option's purchase price.
If you had not bought the option, you would have lost 100 USD if you had
sold the stock at its market price. If the stock is listed by the end of the year at
220 USD, you still have to calculate that you paid 2 USD for the option, but
of course, you will not exercise the option. If you wanted to sell the stock,
you would sell it at the market value of 220 and make a profit.
This also works the other way around. Let’s say you buy for 2 USD the right
to buy a stock for 250 USD. When you purchased the option, the stock was
listed at 200. If, on the call date, the stock is below 250 USD, you will not
exercise your right and will lose 2 USD. But what if that stock is 300 USD at
the call date? You would make a 48 USD profit. Table 1.2. visualizes this in
detail. As a rule of thumb, buyers spend money to hedge risks. As a seller,
you receive money to take a risk from someone else.
Table 1.2 Shows the different options contracts
- Call Buyer: buys the right to buy an asset to a strike price
- Put Buyer: buys the right to sell an asset to a strike price
- Call Seller: sells the obligation to sell an asset to a strike price
- Put Seller: sells the obligation to buy an asset to a strike price
Lastly, after we have examined all the assets, if we compare their returns, we
see that some have more risks and volatility than others. However, we still
need to know more to decide which asset we want to buy.

---

## Page 19
Figure 1.2 Comparison of Returns (generated by ChatGPT)
1.1.2 Picking favorable assets
The easiest way to choose stocks is to flip a coin to pick a random stock.
However, booking a trip to Las Vegas would be more exciting if we wanted
to gamble. The goal of this book is to explore making educated decisions. So,
we want to find a system to choose assets that will increase in value.

---

## Page 20
Occasionally, a new product is released, making many people's lives easier.
When you see that product, you understand that, in theory, everyone could
benefit from that technology. More users mean more revenue, which means a
higher stock price. That decision benefited anyone who bought Apple stock
after Steve Jobs introduced the iPhone.
Still, bias is a risk; while one loves a product, others might disapprove of it.
The technology may be good, but the company's sales personnel may not be,
and eventually, a vendor with a weaker product might prevail. The battle
between the Betamax and VHS video-cassette formats is an excellent
example. Betamax provided better quality than VHS but lost the market. So,
betting on an exceptional product does not guarantee success. Still, the
famous investor Peter Lynch indicated that laypeople who understand a
domain well can make better investment decisions than experienced investors
who do not understand the domain.
Investors always like to find opportunities that promise higher returns. One
opportunity might be emerging countries. But what if, after a coup, a new
government decides to nationalize every company? With every promise of
higher return comes risk.
But even if we invested only in stable economies, risks matter. To minimize
it, we can run due diligence based on financial data, as every public company
reports its financial results publicly. We can compare a company’s financial
performance with its peers and pick the company that the data indicates is
undervalued by the stock market. Benjamin Graham, Warren Buffett’s
mentor, named this approach value investing. The efficient market theory
says that the price of every stock is fair, as stock investors are intelligent
beings with all the information needed. Still, some companies might have
been overseen by some investors, and finding these companies is an
opportunity for profit.
Imagine it is 2016, and you understand that artificial intelligence has a
promising future. You might then discover that one specific company
provides a product everyone needs to succeed with AI and has no real
competitors. Nvidia is an example of this, as AI needs to run on GPUs.
Trying to find a company that will outperform others by market performance
is called growth investing.

---

## Page 21
Figure 1.3 Nvidia (screenshot taken from SeekingAlpha)
Warren Buffett recommended, “to be fearful when others are greedy and to
be greedy only when others are fearful.” This is also the motto of a contrarian
investor. An exceptional example of a contrarian investor is Michael Burry,
who shorted the real estate market before the bubble burst in 2007. The
movie The Big Short tells the story of his success.
As stocks pay dividends, another approach is to look for dividend kings that
pay high dividends to generate passive income. Someone investing 500.000
USD and gaining 5% returns gets 25.000 USD before taxes. Dividend stocks
increase their dividends over time.

---

## Page 22
One ingredient is essential for every investor: patience. But maybe you prefer
thrills and adventure. Some people who aim to benefit from the stock market
look for price movements during the day. It is like a computer game, just
with real money, and those who find patterns in movements faster will gain
profits.
So, we learned that investment has many parameters, from risk and return to
choosing industries and strategies. There is no good or bad; what decides who
you are and your goals.
1.2 Programmers as investors
The media presents us with stereotypes about programmers and
businesspeople. Looking at some movies, programmers and investors are
presented as if they were different species.
The stereotype of an introverted programmer in his hoodie does not fit into a
Wall Street board meeting of managers in suits (unless they are called to fix
IT problems). Characters like Elliot Alderson — the leading role in the TV
show “Mr. Robot” would not fit in a crowd of agitated floor traders —
another stereotype related to finance — signaling to buy or sell orders while
trying to shout their commands louder than their immediate neighbors.
“Mr. Robot” even displays business and IT people as archenemies. On the
one side, there is Philip Price, the CEO of E-Corp, and his peers, who reside
in villas, wear expensive suits, and work in skyscrapers. They are outgoing,
aggressive, and ruthless. On the other side is Elliot Alderson and his friends
of fsociety, representing a hacker group that opposes mainstream society,
including its businesspeople. They partly live in shabby apartments; they
wear street clothes and come from hackerspaces. They might not fit into the
“alpha male” stereotype of businesspeople, but they can outsmart them as
they have the brains to break into their systems and create chaos. No other
show expresses a fictional enmity between “anarchic hoodies” and
“authoritarian suits” like Mr. Robot.

---

## Page 23
If we watch “Mr Robot,” we might wonder what brilliant people like
members of the fsociety could do if they were just using their skills to make
sound investment decisions instead of hacking others’ computers. They can
outsmart firewalls and bypass the most complex threat detection systems;
therefore, they should also be able to outsmart the market. In this section, we
want to offer a view that completely diverges from old stereotypes. While
some stereotypes might find their perfect representation in the real world, we
want to outline that programmers have outstanding skills, traits, and
environments to be excellent investors.
“Greed is good”
This famous quote by the character Gordon Gekko in the film Wall Street
(1987) may have defined how many individuals see the money market.
Especially in economic crises, people without limits who want to enrich
themselves and then need to be bailed out by the government if things go
wrong are seen with much scrutiny. However, we have seen a crypto boom in
which many people in hoodies were as greedy as “the suits, even though they
argued that they wanted to change the world through effective altruism.
One essential step to moving forward is to stop reducing investors
exclusively to “archetypical sharks in suits.” Many famous investors, such as
the late Jim Simons, had no financial background and were unconventional.
Suppose someone would describe the character traits of Warren Buffett
without mentioning him by name. In that case, many might assume that the
person depicted — analytical, introverted, and humble — is rather an
introverted programmer than an outgoing finance person.
In addition, we should also remember that not every investor intends to
enrich themselves purely. Although many became wary of ideas like effective
altruism after Sam Bankman-Fried's conviction, we should still remember
that many intelligent and idealistic individuals see acquiring money as the
key to changing the world for the greater good through sound investments.
1.2.1 Programming skills
Making sound investment decisions often means collecting data on

---

## Page 24
companies and their peers and comparing the numbers. Many investors use
tools like Bloomberg Terminal for this. These applications allow them to
collect everything relevant to one company, from supply chain data to
financial results.
If programmers have access to data sources for financial data, they can
collect all the information that finance tools provide. However, further than
that, they can go deeper and run algorithms on the data and provide specific
insights into specific problems.
Programmers can also make research steps reproducible. Specific algorithms
collect the data, analyze it, and output the results. The programmers can
optimize their data models and algorithms to provide even finer results. As
programmers, using machine learning algorithms or large language models
comes naturally to them. Programmers can write algorithms to monitor the
market, react to signals, and automate investment decisions.
We can even boldly make a statement about programming skills and
investing if we look at Renaissance Technologies, the most successful hedge
fund, and its founder, who is called the world’s most significant investor by
many different parties. Mr. Simons was a mathematician, and his fund is
based on complex machine learning algorithms to beat the market. In a time
where trades are almost exclusively done by computers and floor traders,
who still trade using hand signals, are on the verge of extinction, one may
ask: Can serious investors still afford not to know anything about
programming?
1.2.2 Programmer’s traits
While many people associate success in financial investments with bankers
with an MBA degree who wear pinstripe suits, in this book, we claim that
programmers with an engineering degree in hoodies may also have the
perfect traits and skills for investing. Let’s look at some of these skills that
could be relevant to forecasting future asset prices.
Abstract thinking

---

## Page 25
Many assets, such as company shares or bonds, are immaterial. Programmers
who can solve complex problems by writing code will quickly understand
how stocks or bonds work, as dealing with abstraction is one core element of
their profession.
Many programmers must also foresee exceptional situations in their code.
They learn quickly to anticipate what can go wrong in algorithms, which
gives them a good base for predicting what to look for when managing an
investment portfolio. Programmers are primed to react to impactful events
—catalysts in the investment domain—and foresee what can go wrong, even
if it sounds unlikely.
Self-discipline
Most programmers remember debugging sessions in which error messages
haunted them. Somewhere in a complex code, a hidden bug is difficult to
detect. Even after hours of work, there is hardly any progress. Being an
excellent programmer often means being resilient, facing challenges, and
getting later rewarded for the self-discipline of not walking away in despair.
Eventually, almost all bugs are found and fixed.
Many investors consider patience and self-discipline essential traits for
making extraordinary returns. Excellent investment success, therefore, can
often be seen as delayed gratification, like finding the solution to a complex
bug.
Domain understanding
The famous investor Peter Lynch said, “By simply observing business
developments and taking notice of your immediate world—from the mall to
the workplace—you can discover potentially successful companies before
professional analysts do”(https://www.amazon.com/One-Up-Wall-Street Already/dp/0743200403/). Programmers are often exposed to new trends for
which they must write software, which means they might observe companies
that have the potential to succeed.
Many analysts predict that companies that build solutions in the context of

---

## Page 26
artificial intelligence have huge growth potential. Many programmers are
involved in such projects and may gain a deep domain understanding of that
field, which also helps them make wise investment decisions.
Visionary thinking
Many stereotypes describe programmers as science fiction enthusiasts who
love to read Isaac Asimov, Robert A. Heinlein, and other science fiction
authors who speculate about future worlds. They imagine a world dictated by
AI with self-driving cars that reduce the demand for car ownership and
parking spaces. They ask complex questions, such as how virtual reality can
affect our lives if we are heading toward technologies similar to the holodeck
in Star Trek. Some programmers might even tell you about the probability
that we are already living in a world like the Matrix.
Some programmers may focus on the risks of such futuristic worlds, while
others see the potential benefits. Either way, the ability to imagine the future
is a powerful asset—one that helps identify companies poised to shape it.
1.2.3 Programmer’s environment
So far, we have claimed that programmers can compete with Wall Street
analysts because they have excellent analytical skills. However, there might
be other elements that make them perfect for investing. Let’s look at them.
High income
Programmers often receive higher salaries than employees in other
professions. Of course, a high income does not make an individual an
investor yet; instead, it increases the demand for investments.
The time value of money (TVM) says that money is worth more now than in
the future due to its earnings potential. As intelligent people, they understand
that just stashing cash for long periods leads to a devaluation of money.
Flexible workplace

---

## Page 27
Programmers often have more flexibility when choosing their residences than
other professionals. Theoretically, they can work from anywhere if they have
a notebook and an internet connection.
Being flexible in choosing a place to live and work also means they can
choose to become residents of a country with favorable capital gains taxes.
Some Countries might expect investors to pay around 40% of their assets'
profits, while others might not tax capital gains.
Tip
Consult your local tax consultant about details. Every country may have
individual rules not immediately apparent in an internet search. Also, some
general rules independent of residency may apply. For instance, you are also
taxed by citizenship as a US citizen. Also, you pay withholding tax if you are
not a US citizen but generate income from US-based companies.
Cultivate your investment style
Every financial advisor will ask about your risk tolerance when you talk with
them. Their job is determining how much risk you are willing to take to
receive higher rewards, as higher risks often mean a greater chance of higher
rewards and losses.
This book is not about investment advice, but it is essential to highlight that
you must be clear about risk tolerance before investing. You will not enjoy
your investment journey if you cannot sleep well because you took too many
risks.
Besides risks and returns, clarity about other essential questions will affect
your investment approach. How much time are you willing to spend? Some
methods, such as day trading, require you to watch the market continuously,
while “invest and hold” strategies do not need much attention. Remember
that being alerted at minute intervals about price changes might affect your
life more than you think right now.
Many people have different values, so it helps to decide upfront what you
consider right or wrong in the investment world. Some say shorting is against

---

## Page 28
their values because they feel betting against companies is ethically incorrect,
whereas others do not see a problem with that strategy. With every share you
buy, you strengthen a company. How much do you care if the company
behind that share does business with which you can associate yourself? What
if that company creates products that you despise but promise extraordinary
rewards? You can make your life easier by defining your investment
principles upfront.
1.3 Outlook
The following two chapters lay the foundation: understanding key investment
principles and collecting the correct financial data. These are the building
blocks for identifying assets worth investing in. Chapters 4 and 5 apply these
concepts by finding growth assets and selecting those that generate passive
income.
Chapter 6 explores extracting data from brokers, enriching it, analyzing it,
and exporting it to Google Docs. Once we can track our portfolios, the next
step is assessing risks, which is covered in Chapter 7.
From there, we will explore advanced tools. Chapter 8 introduces machine
learning and GenAI for deeper analysis. Chapter 9 shows how to integrate
GenAI into structured research. Chapter 10 covers technical analysis to
predict market movements, and Chapter 11 explains how to automate trade
execution.
Finally, we will wrap up with private equity investing and a summary of key
takeaways, equipping you with the knowledge to invest successfully as a
programmer.
1.4 Summary
- An investment is an asset or item acquired to generate income or appreciation.
- Assets are not restricted to financial products. Each asset follows different rules and principles to generate value.

---

## Page 29
- Financial assets are highly popular as we can purchase them online through brokers or directly from exchanges.
- A share is a partial ownership of a company. Therefore, every investor could purchase a majority in publicly traded companies. Stocks are usually purchased through stockbrokers.
- Derivatives are investments that are created from an underlying asset. A stock option offers an investor the right to buy or sell a stock under predefined conditions. You can also trade options, meaning you can acquire or sell rights.
- Dividends are payouts made by a company based on shares to shareholders. Not every company pays dividends. Coupon payments, in contrast, are payments received for bonds.
- Unlike stocks, often called equity, bonds are associated with debt. Bondholders do not own parts of the organization to which they lend money, but receive interest payments.
- Some asset management companies create investment portfolios and provide them for their clients as funds. Clients who purchase ETFs reduce their risks and pay a small fee to the asset management company.
- A hedge fund is a riskier investment vehicle with more advanced investment strategies, generally sold to a limited number of wealthy people and institutions.
- Cryptocurrency is an asset that allows people to distribute value without any third party involved in transactions.
- Although some assets are called risk-free, no asset is entirely without risk.
- Programmers may have many skills that help them make sound investment decisions.
- Jim Simons, the founder of Renaissance Technologies(RenTech), might be the role model for the idea that mathematicians, machine learning, and AI engineers can outperform economists in their investment records.
- Individuals should develop investment principles up front that match their preferences related to risk tolerance, time commitment, and ethical questions.
- This book does not give financial advice. Its focus is on teaching best practices for using programming skills and artificial intelligence to gain more insights and make better investment decisions.

---

## Page 30
2 Investment essentials
This chapter covers
- Core understanding of the investment domain.
- Metrics that help us find profitable investments.
- What to look for in financial reports.
In chapter 1, we claimed that programmers’ traits can make wizards of bits
and bytes outstanding investors. But traits (and brains) alone won’t do. Take
the following statement that you might find in any financial analysis of a
share price: “With a P/E ratio of over 25, this stock seems overvalued.” For
someone new to investing, sentences like that or dialogs between investors in
movies such as Wall Street or The Big Short might sound like a foreign
language. In 2003, Eric Evans published his book “Domain-Driven Design,”
which contains principles for creating software in unfamiliar domains for
software engineers. One cornerstone of these principles is the use of
ubiquitous language. This principle asserts that each domain has developed
its specialized language, using terminology exclusive to domain experts. An
essential part of software engineering is learning to understand and
communicate effectively in this language. So, let’s start the next part of our
journey by getting deeper into the domain language of investment.
Once we understand the domain language, we can easily interpret the above
statement. A share is a share of ownership in a company. As a tradable asset,
a share may trade at a price below or above its intrinsic value. To assess a
stock’s valuation, we may investigate multiple metrics or ratios related to a
company’s performance. The above-mentioned P/E ratio is a key financial
metric related to a company’s earnings.
Finance is a complex domain; if one universal strategy led to guaranteed
incredible riches in a short time, hedge funds would not compete for the best
performance. However, intelligent value investors have demonstrated that
finding undervalued stocks, when studying fundamentals, is possible. If you
are solely interested in the code, feel free to proceed to the next chapter,

---

## Page 31
where we demonstrate how to collect the ratios and metrics introduced in this
chapter using Python.
2.1 Accounting in a nutshell
Think of financial statements as a company’s source code. While they may
seem cryptic at first, once you learn to read them, they reveal precisely how a
business is performing. In this section, we explore the basics of reading the
financial code, because investing without understanding at least the basics of
accounting is like trying to create a software application with zero
programming skills.
Companies follow global accounting standards. If one company reports
numbers in one way and another company differently, we would end up in
chaos. One powerful entity can compel companies to report data in a
standardized manner: the government, which requires these reports as a basis
for its taxation.
Note
Just as programmers can misjudge a colleague’s source code at a glance,
investors can misinterpret financial statements. In both cases, context is
crucial, and a seemingly simple number may be misleading without it.
Admitting you were wrong is difficult, making the initial mistake of judging
code or numbers too quickly a costly one.
Accounting standards have not existed since the beginning of stock
exchanges. The prevailing economic philosophy of “laissez-faire” capitalism
in the Roaring Twenties extended to corporate reporting. There were no
federal laws compelling companies to disclose financial information to the
public. While the New York Stock Exchange had some listing requirements,
they were not rigorously enforced, and there was no uniform standard for the
information that needed to be provided. The stock market crash of 1929,
which led to the Great Depression and caused widespread pain, had multiple
root causes. Missing accounting standards exacerbated the problem, and, not
surprisingly, the Generally Accepted Accounting Principles (GAAP) were
established in response to the crash.

---

## Page 32
These accounting standards establish a stable baseline by mandating a
consistent method for companies to report their financial information.
Violating them can be costly, sometimes even threatening a company’s
existence. In addition to GAAP, there is a second standard, the International
Financial Reporting Standards (IFRS), which is used in the international
market. These standards differ in detail, but these differences are irrelevant to
a programmer’s book on investments. What counts is that all companies are
required to report their findings in three documents that are the basis for all
key financial metrics that investors discuss.
- Income statement: How much revenue a business makes and how much it spends
- Balance sheet: What assets a business owns and what it owes
- Cashflow statement: How much cash the business really generates
We can safely assume that every public company provides these three
documents. Whether it is Apple, Walmart, Coca-Cola, or a non-US company
like Rolls-Royce or Deutsche Bank, although the numbers in the sheets might
differ according to the business model, they similarly calculate revenue and
expenses. Every company reports all three statements quarterly.
Note
As this is a book for programmers, we keep the description of accounting
statements to a minimum; however, some basic knowledge is necessary to
perform a financial analysis. Pages such as Investopedia
(https://www.investopedia.com/) can provide interested readers with more
detailed information on monetary terms.
2.1.1 Income statement
An income statement shows the company’s performance over a year or a
quarter. Figure 2.1 also shows the relationship of the income statement to
other statements. Investors typically compare a given quarter with the same
quarter from previous years, as many business conditions fluctuate on an
annual cycle. Consider how much retail companies are impacted by
Christmas sales or the holiday season. Therefore, for some companies, Q4—

---

## Page 33
the quarter of the Christmas season—might be decisive for their overall
success.
Figure 2.1 Illustrates a simplified relationship between the accounting statement and its
interconnection.

---

## Page 34
The main components of an income statement are:
- Revenue: Total income from sales or services

---

## Page 35
- Expenses: Costs incurred to generate revenues
- Net income: Revenue minus expenses, indicating profit or loss
One dollar I receive today is worth more than one dollar in a year. This
concept is called the time value of money. I can invest this dollar today and
earn interest on it. At a five percent annual interest rate, the dollar becomes
one dollar and five cents in one year. Inflation also impacts the time value of
money, meaning I can buy less with one uninvested dollar in a year than I can
today, as consumer prices tend to rise on average.
Imagine a company that consistently generates the same net income over ten
years. Over this period, the real value generated decreases each year.
Investors typically expect a successful company to increase both revenue and
net income over time.
Analyzing a company's accounting statements over time helps in formulating
hypotheses about its performance and operations. Let's explore this using a
simplified financial model of a fictional consulting firm, which is based on
aggregated accounting data. In this model:
- Revenue is generated by selling services.
- Research and Development (R&D) investments encompass training, personnel certification, and the development of new skills.
- Service Costs are primarily the salaries of employees performing billable work.
Figure 2.2 shows this simplified model of the company.
Figure 2.2 Shows a simplified model of a consulting company that makes its money on selling
services and spends most of it on the salaries of their employees.

---

## Page 36
We continue to monitor the company’s financial statements over time and are
interested in seeing if these numbers change significantly. Let’s imagine after
studying their latest income statement, we discover that R&D expenses
increased enormously. The company finances this increase in research with
foreign capital.
Figure 2.3 Indicates outlines that in this scenario the R&D expenses have increased, and the
additional expenses are covered with foreign capital.

---

## Page 37
Just by looking at the increased R+D expenses without any further details, we
must speculate what is going on. We can come up with theories and create a
bullish (optimistic) and a bearish (pessimistic) hypothesis.
- Bullish hypothesis: They must have acquired new projects that will start soon for which they train new consultants, or they are preparing to

---

## Page 38
sell new services to existing customers. The company will see a
significant increase in its earnings soon. If investors panic due to
additional foreign capital the company used to finance further research,
and the share price drops, this company is a perfect buying opportunity.
- Bearish hypothesis: The company had to attract foreign capital to
continue operating. Maybe they are in trouble. If their business goes
bad, we might not see the impact right away on their accounting sheets.
We need to monitor the next income statements to see if their income
goes down and if they start cutting expenses. If they plan to roll out new
services and fail, they will incur additional debt and may run into
liquidity issues. It may be better to not to invest in that company.
Consider an alternative scenario. The company reduces its spending on
services and R&D, while the revenue is unaffected. Figure 2.4 outlines this
scenario.
Figure 2.4 Indicates a situation in which companies reduce spending on research and services.

---

## Page 39
This scenario suggests that the company may see little room for growth.
Instead of trying to increase profits by selling more, they monetize existing
revenues. Financial experts may examine the interest rate set by the Federal
Reserve or the central bank to determine whether that company’s strategy is
tied to an economic cycle. Many companies prefer to invest less when
interest rates are high and the economy is in a recession. But still, all we can
do is to create hypotheses about what is happening.

---

## Page 40
- Bullish hypothesis: They still provide the same number of services for
existing clients for less expenses. This indicates that they do more work
for the same money. Maybe they got more efficient thanks to artificial
intelligence and automated their processes. As they create a surplus,
they might become a dividend paying stock. This is an opportunity to
generate passive income.
- Bearish hypothesis: Companies’ value increases if they grow. If they
cut down on research, they will likely not grow. Having a surplus is fine,
but if we do not know what the company is planning to do, it is better
not to invest.
This was a simplified model, used for demonstration purposes, for a type of
company that is relatively easy to model. Consulting companies can be
relatively straightforward, as expenses are often linked to income.
Consultants work on client projects. The company makes a profit by selling
them at a higher price than their salary expenses. Other companies are far
more challenging to model. For example, think of a conglomerate like
Alphabet, for which you need to consider subsidiaries like Waymo and which
operate in multiple domains from advertisement to cloud computing.
Another challenge is that we reduced our model to a minimum of parameters
for demonstration purposes. The reality is more complex. At the same time, if
you analyze concrete companies, you have more resources, such as media
reports on the company and interviews with analysts who know the company
well. Data-driven investors can build models of companies and create their
own priorities about what they consider to be essential for a company’s value.
What is essential might vary from business to business.
Note
Companies in different industries operate on vastly different business models.
A tech firm like Apple spends enormous sums on R&D to create a few high-revenue products. In contrast, a supermarket chain like Walmart focuses on
selling a high volume of products from many suppliers. For Walmart,
innovation isn’t about creating new products, but about optimizing storage
and supply chains while maintaining quality service. Therefore, comparing
metrics like R&D spending between Apple and Walmart would be

---

## Page 41
misleading—it’s like comparing apples and oranges. An investor can achieve
a far more insightful analysis by comparing companies within the same
industry, such as evaluating Walmart against a direct competitor like Costco.
The income statement reveals how much a company earns and how it
allocates its expenses, which helps us evaluate a company’s strategy. To
complete our tour of financial statements and gain a comprehensive picture,
we must now determine what the company already owns. We get this
information from the balance sheet.
2.1.2 Balance sheet
The income sheet tells us what a company made in a period. It lists how
much revenue it generated and its expenses. The information that a company
already owns or owes still needs to be added. The essence of a balance sheet
can be reduced to the simple formula:
Assets = liabilities + shareholders’ equity.
Assets are what a company owns, liabilities are what it owes, and shareholder
equity is the amount shareholders would get paid if all assets were liquidated
and the debts were paid. A company may be in serious trouble when its
liabilities exceed its assets.
Liquidity is a metric that tells how easily an asset can be converted to cash.
Imagine a manufacturing company that puts one of its factories, along with
all its machinery, up for sale. It may take some time to find a potential buyer.
Other assets, such as inventory goods, may have better liquidity.
Note
Do you think like an economist? Consider everything you own, such as
computers, cars, or clothing; would you list these items as non-liquid assets?
Or do you count only your financial assets as part of your net value?
Programmers often work on projects to reduce capital expenses (CapEx) for
their clients or employers. Cloud migration may be the best reference for
such projects, as companies decide that they prefer renting over owning

---

## Page 42
hardware with such a move. Some investors also claim that software
companies are popular investments because they are not capital-intensive.
Low CapEx is often considered low risk, as it requires less initial investment,
even though operating expenses (OpEx) may be higher.
Note
Engineers sometimes perceive economic soundness differently than business
administrators. Think of an on-premises platform that solves business
problems with minimal operating expenses. While engineers might view the
investment as sound, if costs are reduced permanently and a return on
investment is achieved over time, a business administrator may be more
cautious. Among other things, he might argue that higher upfront CapEx
expenses may lead to lower liquidity, and he raises the question of
opportunity costs and the real total cost of ownership.
The balance sheet might differ significantly between industries. Software
companies may have almost no assets listed as inventory, whereas
supermarket chains must maintain a large inventory to quickly supply
customers with goods. Additionally, you will find inventory listed under
current assets in companies like Nvidia, which sell hardware.
The balance sheet already indicated that more liabilities than assets would be
an alarm signal. However, there is another detail to analyze after we
understand that the “accounts payable” and “accounts receivable” entries on a
balance sheet indicate that we might have some incoming or outgoing money
in our books, but not yet in our possession. It is possible that a company
cannot pay its bills, even if its books show a positive balance. A third
financial statement can give us more details on a company’s solvency. Let’s
examine the cash flow statement.
2.1.3 Free cash flow
We must be aware that we cannot pay bills with all forms of assets. Free cash
flow (FCF) is the amount of cash remaining after a company has covered its
operational costs and capital expenditures. The simplified formula of FCF is

---

## Page 43
Free cash flow = operating cash flow - capital expenditures.
Operating cash flow refers to the cash a company generates through its
normal business operations. More than any other document, this statement
reveals whether the company is financially stable, can afford new
investments, and can pay its bills without incurring additional debt.
Why cash flow matters
Imagine Eugene owns a prestigious business that purchases antique cars,
renovates them, and sells these vintage beauties to car enthusiasts. He has
invested a lot of money in a garage and a small factory hall, where he also
stores a vast inventory of rare replacement parts. You are transported to a
different era in the garage when you see all the Studebakers, Packards, and
classic Chevrolet Impalas.
One day, Eugene looks at his books and realizes he has run out of cash. He
had previously found a treasure trove. A wealthy collector of old cars had
passed away, and Eugene acquired a vast collection of rare old vehicles from
the heirs at a significantly reduced price. Eugene knows that he can sell all
those cars with a huge profit margin, but buying all these cars requires him to
use all his cash reserves, and he must even take a loan from his local bank.
Some salary and other payments are due soon, so he can only keep his
business in operation by borrowing more money. His local bank, which had
already given him the first loan, is hesitant to give him a second one and is
inquiring about securities.
Eugene’s cars and equipment might be worth millions; some clients might
even owe him money. However, he cannot pay the plumber who fixes his
restrooms in the shop by giving away a car or a client’s debt. A vehicle in
Eugene’s inventory is not a liquid asset.
If Eugene proves that his business outlook is good, he will most likely get a
loan from the bank. Still, this example suggests one idea we can explore with
algorithms: the risk that a company may be insolvent.
Each accounting statement will still contain many unfamiliar terms to

---

## Page 44
individuals without a degree in business administration. Explaining each term
in this book is not possible. We encourage every reader to look up and
research terms on demand.
Programmers might have seen code written for web applications, data
processing, or embedded systems. Each domain requires different best
practices, depending on the resources available. The same principle applies to
companies. Only some of the best practices are effective for certain
companies. Companies are distinct, and understanding this difference is
crucial if you want to invest in them.
2.2 Industry classification
Before discussing financial metrics and ratios, let’s examine the possible
sectors and industries to understand potential differences in how companies
generate revenues and allocate their expenditures. Figure 2.5 outlines a
categorization of sectors according to the Global Industry Classification
Standard (GICS) of S&P
(https://www.spglobal.com/spdji/en/landing/topic/gics/), a standard used to
categorize companies based on their business models.
Figure 2.5 Shows all sectors with icons based on the GICS standard used in many financial
platforms (taken from https://www.msci.com/our-solutions/indexes/gics)

---

## Page 45
Note
GICS is one standard among multiple official industry classification
standards. Investors, such as Peter Lynch, created their unofficial systems.
We encourage readers to explore these standards independently, as they offer
different perspectives on companies and can help deepen their understanding.
We use GICS in this book for its widespread global use and recognition.
GICS groups companies on four levels. The sector represents the highest
level, and sub-industries are at the most detailed level. Different
categorizations of businesses help to separate them by business models. Each
business model may impact the financial metrics and ratios to watch.
Governments regulate specific sectors more heavily, and changes in law have
a greater impact on companies in these sectors than on others. Other sectors
might be more affected by increased interest rates or economic cycles than
others.
2.2.1 Influences on GICS sectors
In this chapter, we aim to identify factors that can influence a company,
enabling us to build models later. If we know, for instance, that a sector is
influenced by interest rates, economic cycles, and raw material costs, we can

---

## Page 46
try to build a machine learning model that predicts stock prices based on
these input factors as features of the ML model. In table 2.1, we introduce the
GICS sectors and the key factors that may influence the price of an asset in
each sector.
Table 2.1 GICS sectors and their influences
- Utilities: Companies that provide essential services such as electricity, water, and natural gas. Influenced by Interest rates, energy prices, regulation, and bond yields.
- Consumer staples: Companies that produce essential products such as food, beverages, and household items. Influenced by Interest rates, inflation, consumer confidence, and raw material costs.
- Consumer discretionary: Companies that produce non-essential goods and services, including automobiles, apparel, and leisure. Influenced by Consumer spending, unemployment rates, and disposable income.
- Communication services: Companies that provide communication services, including telecom and media. Influenced by Government regulation, intense competition, technology changes, general economic conditions, consumer and business confidence, spending, and changes in consumer and business preferences.
- Real estate: Companies involved in the development, management, and operation of real properties. Influenced by Demographic changes, interest rates, economic cycle, government policies, housing demand, and economic growth.

---

## Page 47
- Information technology: Companies that produce software, hardware, or semiconductor equipment, and companies that provide internet or related services. Influenced by Innovation, cybersecurity threats, and regulatory changes.
- Energy: Companies that play a role in extracting, refining, or supplying consumable fuels. Influenced by Oil prices, geopolitical stability, and renewable energy trends.
- Health care: Companies that provide medical services, manufacture medical equipment, or develop pharmaceuticals. Influenced by Pandemics, regulation, drug pricing, and demographic changes.
- Financials: Companies that provide financial services, including banking, insurance, and investment. Influenced by Interest rates, economic cycles, and regulatory changes.
- Industrials: Companies that produce goods used in construction and manufacturing, including machinery and equipment. Influenced by Manufacturing output, trade policies, and commodity prices.
- Materials: Companies that provide raw materials used in the manufacturing process, including metals and chemicals. Influenced by Commodity prices, supply chain stability, and environmental regulations.

---

## Page 48
Some categorizations of companies might be misleading. Many would
consider Amazon, Tesla, and Google to be companies in the information
technology sector. GICS categorizes Amazon and Tesla in the Consumer
Discretionary sector, and Google in the Communication Services sector. Still,
when looking up ratios, it makes sense to look up the company’s sector to
add context.
Invest only in companies whose business you understand.
Warren Buffett recommends investing only in businesses that one
understands. A supermarket chain like Walmart is a different business from a
tech company. If a tech company launches a successful product, it may be
reflected in its yearly results (Think of the impact of the iPhone on Apple’s
business). However, the best-selling product of a supermarket chain will not
have a visible effect on an accounting statement.
Reading accounting statements of a company and understanding what they
mean, as well as being able to interpret changes in numbers, may not make
you an accountant, yet. However, being able to interpret the numbers and
connect them to the company's business model provides a foundation for
making wise investment decisions.
2.2.2 Sectors and economic cycles
From common sense, it is logical that in an economic crisis with unpleasant
side effects, such as high unemployment rates or high inflation, some
businesses are more affected than others.
To demonstrate the impact of economic cycles on share prices, let’s pick four
suspects: Microsoft (MSFT), Coca-Cola (KO), Walmart(WMT), and Ford
(F), and check their share prices during the 2008 financial crisis, when the
housing market collapsed. For table 2.2, we used an interval from January 1,
2008, to January 1, 2010.
Table 2.2 Highs and lows of selected share prices from 2008 to 2010.

---

## Page 49
Company High Low Avg
MSFT 35.95 14.87 24.82
KO 32.79 18.72 25.65
WMT 21.28 14.37 17.60
F 10.37 1.01 5.42
Even if we only look at the numbers, it is evident that Ford’s value declined
far more steeply than Walmart’s, falling to just one-tenth of its previous value
at its lowest point. A bar chart accentuates the changes even more clearly.
Figure 2.6 Data from the table in a bar chart, making the drop in value of some companies more obvious.

---

## Page 50
Common sense suggests that this cart makes sense. Ford and Microsoft
produce products that consumers can drop more easily. If resources are
scarce, postponing the purchase of a new car may be a viable option, but not
going to the supermarket, even in a crisis, is not possible; we still must eat.
Let’s examine how various sectors performed during the 2008 financial
crisis.

---

## Page 51
One way to improve this exploration is to compare sector indices. A sector
index is a collection of multiple companies within a single sector, which can
also be referred to by their respective tickers. In the figure below, we look at
XLK (technology sector), XLP (consumer staples), and XLY (consumer
discretionary). Figure 2.7 outlines what common sense has already told us:
Companies producing goods for everyday needs are less affected by crises.
Figure 2.7 Shows the impact of the 2008 housing market crisis on selected indices (XLK
(technology sector), XLP (consumer staples), and XLY (consumer discretionary)).

---

## Page 52
A company’s performance is fundamentally linked to the economic cycle,
which consists of four stages: expansion, peak, contraction, and trough.

---

## Page 53
During an economic expansion, rising employment and disposable income
boost spending on non-essential goods. Conversely, during a contraction,
consumers prioritize essentials and cut back on discretionary items. This
dynamic reveals that some companies are highly cyclical, with their success
directly tied to the health of the economy. In contrast, others are non-cyclical
or defensive, remaining stable during economic downturns. This sensitivity
extends beyond business cycles, as other macroeconomic forces—such as
government fiscal policy, interest rates, inflation, commodity prices, and
currency exchange rates—also affect industries in vastly different ways.
2.3 Capitalization
As we now understand that companies in different industries and sectors may
react differently to market conditions, we might develop an investment
hypothesis and call it “invest in too big to fail companies.” While smaller
companies might perish in a crisis and lose their invested money
permanently, we can bet on big companies that will survive all crises and
consistently grow over the years, on average.
Before we challenge this idea, let’s first define what larger or smaller means.
The number of employees at a company can be a misleading indicator of size.
A more suitable metric for investors to consider is capitalization. In short,
capitalization refers to the value that people are willing to pay for the
company at the current time. Investors calculate a public company’s
capitalization by multiplying the total amount of outstanding shares of a stock
by the current stock price.
Although many companies with a small market capitalization, such as
startups and SMEs, are private and, therefore, not listed on stock exchanges,
the difference between companies on the stock market can still be vast. We
can group companies as follows (with some slight variations in different
markets):
- Mega-cap: market value of $200 billion or more
- Large-cap: market value between $10 billion and $200 billion
- Mid-cap: market value between $2 billion and $10 billion
- Small-cap: market value between $250 million and $2 billion

---

## Page 54
- Micro-cap: market value of less than $250 million
A mega-cap company’s bankruptcy risk is lower than that of companies with
a lower market capitalization. At the same time, finding tenbaggers — a term
coined by Peter Lynch for an investment that returns ten times its initial
purchase price — is much more likely with a micro-cap stock. They have far
more room to grow.
Note
Intrinsic reflects an asset’s true worth, which can be estimated using various
methods, such as discounted cash flow analysis or other fundamental
valuation techniques. Even with rigorous analysis, every intrinsic value
estimate carries a degree of uncertainty. The greater the gap between an
asset’s market capitalization and its estimated intrinsic value, the larger the
potential investment opportunity.
Mega-cap companies, such as Nvidia, Apple, or Microsoft, differ
significantly from those with a considerably lower market value. Investors
who own shares in mega-cap companies may sit out crises, as the likelihood
of bankruptcy is low. Companies with a viable business model will
eventually return to their earlier, higher share prices. Shareholders of smaller
companies may be more concerned about worst-case scenarios. The smaller
the company, the higher the risk, but also the higher the chance for gains.
Many experienced investors, for this reason, love to explore smaller
companies and mitigate risks by conducting more thorough due diligence and
in-depth research.
If we look back in time and examine the fate of companies with the highest
market capitalization over the decades, we will see that some past winners
have lost their significance or disappeared. Even Jeff Bezos claims that
Amazon might fail at some point in the future
(https://www.theguardian.com/technology/2018/nov/16/jeff-bezos-amazon-will-fail-recording-report). Trusting that giants on the stock market will
always survive might end up like betting during the Jurassic era that some
large reptiles are too big to go extinct. Instead, the stock market is akin to the
survival of the fittest, and it makes sense to investigate the fundamentals of
companies.

---

## Page 55
2.4 Metrics and ratios
With knowledge of a company's classification and capitalization, we have a
basis. We might pick companies in a sector we understand and choose
companies to invest in. Now, we need to learn more about a company’s
fitness. A metric is a statement about a company’s performance. One
example is the dividend yield, which indicates the amount of dividends per
share. We get most metrics from the accounting statements. A ratio is a
statement about a relationship between two independent metrics. The price-to-earnings ratio (P/E) measures the share price relative to the earnings per
share (EPS).
Understanding financial metrics is much like evaluating software quality. In
software development, metrics like code readability are essential; however, a
catastrophic score in one area—such as a high crash rate—demands
immediate action from team leaders, regardless of how elegant the code may
be. Similarly, in finance, a company might appear strong. Still, a critical red
flag from a single ratio, such as an inability to pay its bills, signals serious
trouble that forces management to take action.
Conversely, just as no single metric can guarantee a high-quality product, a
few good financial ratios alone do not confirm a company's health or future
success. A common investment mistake is to fixate on one impressive
number while ignoring potential weaknesses elsewhere. The key in both
fields is a holistic evaluation. By analyzing multiple metrics and comparing
them to those of industry peers, we can develop a strong and reliable
indicator of a company's overall performance.
Note
It is impossible to cover all ratios used in the financial industry. Therefore,
this subset of possible ratios might be interesting when assessing potential
investments. Web pages such as (https://fullratio.com/terms) give more
context to what each ratio could mean for an industry.
To assess a company’s overall status, we must consider multiple factors. As
we will demonstrate in chapter 3, platforms with stock screeners, such as

---

## Page 56
Finviz, provide an excellent overview of company data. Let’s examine some
ratios for Nvidia and Walmart in table 2.3. Beta is a measure of a stock’s
volatility—or systematic risk—in relation to the overall market.
Table 2.3 Shows selected ratios of Nvidia and Walmart, taken on June 8, 2025, from the Finviz platform.
Company Market Cap Sales Employees P/E Beta
Nvidia 3457.97B 148.51B 36000 45.65 2.12
Walmart 779.85B 685.09B 2,100,000 41.81 0.69
We find some noteworthy differences in the numbers. Walmart’s revenue is
significantly higher. However, the supermarket chain also has approximately
60 times the number of Nvidia’s employees. Many employees also mean high
expenses. A supermarket chain also needs to maintain a lot of infrastructure
and inventory. However, as mentioned already in the section on sectors and
economic cycles, during economic downturns, customers will still visit
supermarkets to buy food.
In contrast, some individuals and companies will delay technology purchases
if they do not have sufficient funds. A low beta value of a stock — Walmart
has a beta of 0.69, and Nvidia has a beta of 2.12 — reflects its resilience
against market risks. We observe considerable differences in expected values
across GICS sectors, as well as in other ratios.
2.4.1 Liquidity
In the simplest terms, liquidity measures a company’s ability to pay bills. If
you collect information on multiple companies in a data frame, you might
find problematic outliers. In this chapter, we explore two ratios: the current
ratio and the quick ratio.
The current ratio measures a company’s ability to pay its short-term
liabilities with its assets. It is calculated by dividing the current assets by the
current liabilities. We can collect both values from the balance sheet.
The quick ratio is more stringent. It only considers assets, such as cash,

---

## Page 57
marketable securities, and receivables, that the company can use to pay short-term debts today and omits assets like inventory. Below are the liquidity
ratios for Walmart(WMT), Altria(MO), Nvidia(NVDA), and
Salesforce(CRM)—the results as of June 8, 2025, are shown in table 2.4.
Table 2.4 Liquidity ratios for WMT, MO, NVDA, CRM (June 8, 2025)
Ticker Sector Industry Current ratio Quick ratio
WMT Consumer Defensive Discount Stores 0.780 0.185
MO Consumer Defensive Tobacco 0.571 0.468
NVDA Technology Semiconductors 3.388 2.857
CRM Technology Software-Application 1.069 0.899

Table 2.5 Liquidity ratios for WMT, COST, TGT, DLTR (June 8, 2025)
Ticker Sector Industry Current ratio Quick ratio
WMT Consumer Defensive Discount Stores 0.780 0.185
COST Consumer Defensive Discount Stores 1.015 0.472
TGT Consumer Defensive Discount Stores 0.935 0.152
DLTR Consumer Defensive Discount Stores 1.044 0.122

---

## Page 58
As we delve into the numbers at the micro level for the same sector, we need
to take a deeper dive into them with a different mindset to make key
decisions. Perhaps the insight from one category alone is not enough for an
investment decision, but it can still influence it. An investor knowledgeable
in discount stores might examine all these numbers and deduce that Costco
has a better ratio than Walmart.
Note
Value investors know what makes businesses in the sectors they understand
successful and look for confirmation in numbers. They often spend a
considerable amount of time comparing metrics they have selected based on
their understanding of the business. For value investors, sophisticated
scorecards of carefully chosen metrics and ratios can be key decision-making
factors.
2.4.2 Debt
In a financial sense, debt is all liabilities with interest-bearing obligations.
The debt-to-equity (D/E) ratio is calculated by dividing a company's total
liabilities by its total shareholders' equity. This ratio is a key indicator of a
company's financial leverage, showing the proportion of debt used to finance
its assets compared to equity. A higher ratio indicates a greater reliance on
debt financing, which can increase financial risk. Let’s look again at some
examples in table 2.6.
Table 2.6 Liquidity/Debt ratios for AAPL, WMT, NVDA (June 8, 2025)
Ticker Sector Industry Debt-to-equity
AAPL Technology Consumer Electronics 146.994

---

## Page 59
WMT Consumer Defensive Discount Stores 74.138
NVDA Technology Semiconductors 12.267
This chart highlights the need to look beyond surface-level metrics. While
Apple’s debt-to-equity ratio seems ten times worse than Nvidia’s, the number
reflects a deliberate financial strategy, not necessarily poor health.
Apple strategically issues highly-rated corporate bonds at very low interest
rates to finance its research, development, and other growth initiatives. For
investors, this debt is not a red flag if the interest rates are close to or below
the rate of inflation. In that scenario, the company is using low-cost leverage
as a powerful tool to fund growth, turning a seemingly poor ratio into a sign
of sophisticated capital management.
The interest coverage ratio, not shown in the table but a key metric to explore
in an analysis focused on debt, is a crucial indicator used to assess a
company's ability to pay the interest on its outstanding debt easily.
It is calculated by dividing a company's EBIT (Earnings Before Interest and
Taxes) by its interest expenses for a given period. A result below 1.0 is a
universal red flag, indicating that the company's current profits are
insufficient to cover its interest obligations, which signals significant
financial distress regardless of the industry.
2.4.3 Earnings
We collect the raw earnings data from the income statements to calculate
ratios. The earnings per share (EPS) metric serves as the basis for many key
ratios. They measure the company’s profits for each outstanding share. The
EPS is calculated with the formula:
(Profit – preferred dividends) / shares outstanding.
In earnings calls, companies inform their shareholders about quarterly results.
Companies retrospectively assess past earnings from previous quarters and
estimate their earnings for the following quarters. Whether the numbers are

---

## Page 60
above or below expectations can impact the stock price.
Free cash flow per share is a profitability metric that measures the total
amount of free cash flow generated by the company attributed to each share
over one year. A good ratio of free cash flow underlines that a company can
expand business operations, pay down debt, or return capital to shareholders.
The formula is
free cash flow per share = free cash flow(FCF) / shares outstanding.
The FCF is calculated by
operating cash flow - capital expenditure.
The earnings ratios are mostly interesting for valuation purposes, as earnings
are often used as a basis to evaluate the company. So, it makes sense to
continue there.
2.4.4 Valuation
Suppose a startup claims to be valued at $100 million. What does this mean?
A third party believes that $100 million could be a fair price for acquiring a
specific startup. However, if a potential buyer is willing to pay this amount,
that is another story.
Startup valuation can be tricky. Proper valuation, such as with the discounted
cash flow (DCF) method, requires sound accounting practices over multiple
years. This demand raises questions: Has the startup reported enough years
with all the thoroughness necessary for a sound assessment? What if the third
party doing the valuation benefits from giving a high rating? (They might
attract other startups by giving high valuations in general.)
Startup valuations are often rough estimates of a startup’s worth, assuming
everything goes as planned and there are no hidden issues. According to the
efficient market theory, the share price on a stock exchange reflects all
available market information, and therefore, the valuation of public
companies is more accurate. We multiply the stock price by the number of

---

## Page 61
shares outstanding and obtain the company’s market capitalization. Some
investors challenge this assumption and try to use valuation metrics to find
undervalued companies. We can do the same: let’s learn valuation ratios
quickly and complement our knowledge by comparing ratios using practice
examples.
We observed that earnings per share are a crucial metric. If an EPS diverges
strongly from the previous report, it is a strong buy or sell signal for
investors.
Note
The exact formula for EPS also subtracts a metric of preferred dividends from
the net income, which can be ignored for this example.
We have defined EPS above. We calculate the price for one USD of earnings
(price-to-earnings) by dividing the share price by EPS. The price-to-earnings
ratio is essential for determining whether a stock is over- or undervalued.
If we take the time to explore the P/E ratios of multiple companies, we will
soon learn that they vary significantly. If Nvidia has a P/E ratio of 47.61 and
Pfizer one of 10.43, as of January 31, does this mean Nvidia is overvalued,
and Pfizer is undervalued? The reality is so not simple. We need to compare
the P/E ratio of a company with a baseline. One baseline could be the S&P
500 index. At the time of writing, the P/E ratio of the S&P 500 was around
30. However, this is still vague. The average P/E ratios vary by sector.
Therefore, it may be more effective to compare a company's P/E value with
that of its peers. In this example, the sector median is 25.31, which indicates
that Nvidia is overvalued. But there is still one issue. The P/E ratio does not
include projected growth. By dividing the P/E ratio by EPS growth, we get
another standard ratio, the PEG ratio. Let’s take a snapshot of Nvidia’s
valuation as of June 8, 2025, shown in table 2.7.
Table 2.7 A snapshot of Nvidia’s valuation from June 8, 2025

---

## Page 62
Table 2.7 (Cont.)
- P/E Non-GAAP(TTM): Grade D, NVDA 44.43, Sector Median 22.20, % Diff 100.10%, 5Y Avg 63.09, % Diff 5Y -29.59%
- P/E Non-GAAP(FWD): Grade C-, NVDA 33.14, Sector Median 22.64, % Diff 46.38%, 5Y Avg 47.38, % Diff 5Y -30.05%
- P/E GAAP(TTM): Grade C-, NVDA 45.71, Sector Median 28.17, % Diff 62.22%, 5Y Avg 83.84, % Diff 5Y -45.49%
- P/E Non-GAAP(FWD): Grade C, NVDA 35.04, Sector Median 29.14, % Diff 20.24%, 5Y Avg 62.08, % Diff 5Y -43.56%
- PEG GAAP(TTM): Grade B, NVDA 0.56, Sector Median 0.91, % Diff -38.45%
- PEG Non-GAAP(FWD): Grade B+, NVDA 1.15, Sector Median 1.73, % Diff -33.48%, 5Y Avg 1.80, % Diff 5Y -36.21%

Which story do you want to tell?
In June 2024, Nvidia became the most valuable company in the world, with a
total valuation of over $ 3 trillion. The snapshot of Nvidia shows that it is up
to us to decide which story to tell with the data.
The P/E ratio, as of January 31, 2025, is calculated using a share price of
$124.65, resulting in a P/E ratio of 47.61. The sector median is 25. In
addition, Nvidia’s P/E ratio is far above its peers. We could stop here and
conclude that it is unwise to buy shares in a company where you pay more
than double for each earnings compared to similar companies.
If we look at future earnings, things start to look more promising. Nvidia had
great past earnings, but future earnings look even better. The P/E GAAP
(FWD) brings us closer to the sector peers. However, we can reason
differently than before with the PEG GAAP (TTM) and PEG Non-GAAP
(FWD). First, we must highlight that there has been a substantial increase in
earnings. Projecting these earnings into the future gives us a ratio (PEG
GAAP (TTM)) that beats the sector by 81.27%. We can reason that Nvidia
remains a bargain, considering its P/E ratios have consistently been higher
than those of its peers in the past, and its share price has still increased
significantly.

---

## Page 63
The price-to-sales ratio reflects the price per $ 1 of sales. Sales figures are
generally considered relatively reliable, whereas other income statement
items, such as earnings, can be manipulated by various accounting rules. For
early-stage companies that are not yet profitable, sales growth, as represented
by this metric, can be a good indicator of future success. The price-to-book
ratio is how much you pay for one USD of equity. It reflects the market's
valuation of the company's net assets on its balance sheet and is particularly
attractive for capital-intensive companies.
After this brief introduction to ratios, we can make them more meaningful by
examining examples. For this, we select two technology companies (Apple
and Nvidia), one utility company (Sempra), a supermarket chain (Walmart),
and a communication services company (AT&T), and depict them in table 2.8.
Table 2.8 Earning ratios for NVDA, AAPL, SRE, WMT, KO (June 8, 2025)
Ticker Forward PE Trailing PE PEG ratio Price-to-sales Price-to-book Beta
NVDA 34.40 45.72 1.76 23.27 41.22 2.122
AAPL 24.54 31.76 1.85 7.61 45.10 1.211
SRE 14.95 16.89 2.03 3.76 1.63 0.656
WMT 35.83 41.65 3.72 1.14 9.32 0.693
KO 24.02 28.65 4.41 6.55 11.72 0.46
Let’s try to interpret the numbers of two companies. Nvidia has a high P/E
ratio and a low P/E/G ratio. These numbers indicate that Nvidia is still
experiencing massive growth, and we expect continued earnings growth in
the future.
Note
Investors might also consider whether outstanding PEG ratios are sustainable
over multiple years. The holy grail of many investors is companies that show
constant earnings growth over the years and whose further growth cannot be
challenged by competitors.

---

## Page 64
In contrast, Coca-Cola’s PEG ratio indicates lower growth potential. This
maturity makes it a perfect candidate for a dividend-paying company, which
we will explore in the dividend section of this chapter.
As shown in the liquidity section of this chapter, comparing different sectors
may help us see common knowledge reflected in numbers. Coca-Cola has
been in existence since 1892; its soft drinks are already widely distributed
worldwide. With that, it is improbable that this company would face an
existential crisis. It is hard to imagine that a vast percentage of consumers
who are used to drinking Coca-Cola would stop drinking it. Nvidia is the
market leader in a competitive market. In recent years, they have gained
success after success, and their growth continues as the market expands
significantly (a trend not observed in the soft drinks market). At the same
time, it is more conceivable than with Coca-Cola that the semiconductor
market could be disrupted by a competitor, making Nvidia less resilient than
Coca-Cola.
Comparing Nvidia with AMD (trailing PE of 81.81 and PEG ratio of 0.59)
would be more interesting, as we could hypothesize that while AMD is
overvalued compared to Nvidia, its growth potential is bigger.
2.4.5 Profitability
We calculate profitability by subtracting expenses from earnings, and we can
calculate profitability ratios. Having data about profit (or loss), we need to
understand its relationship to other parameters, such as assets or equity. In
some cases, we may find that we make a profit, but compared to the amount
of money invested, the investment can still be considered a questionable
decision.
Return on Assets (ROA) is calculated by dividing net income by total assets.
It reflects how effectively the company uses its assets to generate revenue. If
Company A reported 10.000 USD of net income and owns 100.000 USD in
assets, its ROA is 10%. Every 1 USD of assets generates 0.1 USD in profits
yearly. It takes ten years to pay off all the asset investments.
Return on Equity (ROE) is calculated by dividing net income by shareholder

---

## Page 65
equity. It indicates how effectively a company compensates its shareholders
for their investment. If Company B reported $10,000 in net income and its
shareholders have $ 2,000,000 in equity, its ROE is 0.5%. For every $1 of
equity that shareholders own, the company generates $0.05 in annual profits.
We calculate the profit margin by dividing the net income by the revenue.
This metric often varies significantly across different industries.
Supermarkets sell a lot, but their margin per sale is low.
2.4.6 Dividends
Some new investors may wonder why some companies pay dividends at all.
Companies would retain more profits without dividend payments, and more
cash means having more opportunities to invest in the company's growth.
Let’s think about Coca-Cola. Almost everyone is familiar with the brand and
has tried its flagship product. Even with the highest imaginable marketing
budget, the company could not make the brand more widely known to the
global population, and it is challenging to convert those who do not drink
Coca-Cola already into customers. Even the most eloquent advertisement
campaign will not convert those who have tried it and who prefer other
beverages to fans.
If the company did not spend its profits due to missing growth opportunities
in a mature market, it would need to hoard them. Consequently, inflation
would decrease these savings. Returning money to investors makes sense,
especially since this strategy makes the stock more attractive for investment
strategies that rely on returning cash to their investors, such as retirement
funds.
What if a company starts using its money to invest?
Companies can also use profits to invest in other companies. Coca-Cola
might be a good example of such a move. They owned subsidiaries in the
entertainment industry, such as Coca-Cola Telecommunications. Readers
from the UK will be familiar with bank divisions, in addition to Tesco and
Sainsbury’s stores, and both supermarket chains attempted to establish virtual

---

## Page 66
network operators.
Companies with strong brand recognition and financial power have many
opportunities to enter new markets. Whether this strategy is good or not is
debatable. Some may argue that it risks damaging the brand's reputation and
might be hindered by bureaucracy. Others may reason that these companies
already have established structures and can utilize their capital to expand into
other industries as a conglomerate. History shows that not all spin-offs of
successful companies met their expectations, and they have good reasons to
stick to their core business.
Let’s explore the details of creating passive income with stocks. Passive
income investors buy X shares of a company with higher dividend yields,
such as Coca-Cola, on day Y. For their stock ownership, they get dividends
paid in intervals. Dividend payouts are a provided amount of money per
share. This payout is taken from the share price. In other words, an investor
who buys shares before a dividend payout to sell them again after the
dividend payout will not benefit from such a move.
Dividend stock investors may also benefit from capital appreciation.
Examining many high-dividend-paying companies, we observe that they also
tend to grow in share price. Let’s look at table 2.9. In this table, we have
highlighted some growth companies (those that invest their surplus more in
growth) and value companies (those that prefer to pay dividends rather than
invest in further scaling the company). We observe this in the payout ratio,
which is the percentage of profits distributed as dividends, and the dividend
yield. Someone who buys Apple stock purely for dividend yield picked the
wrong strategy to invest in Apple. The interest rate of treasury bonds, which
reflects the risk-free rate of capital, is mostly around 5%. Altria (MO) is the
only stock in the table with a dividend yield above the interest rate of
Treasury bonds, at 6.89%.
Table 2.9 Dividends of Apple, Altria, Microsoft, Nvidia, Sempra, Walmart, and Coca-Cola (Seeking Alpha June 8, 2025)

---

## Page 67
Table 2.9 (Cont.)
Ticker Yield FWD Payout Ratio Div Growth 5Y Consecutive Years Growth Consecutive Years Dividend
AAPL 0.51% 14.10% 5.24% 12 years 12 years
MO 6.89% 77.54% 4.00% 55 Years 55 Years
MSFT 0.71% 25.04% 10.24% 20 Years 20 Years
NVDA 0.03% 1.25% 20.11% 1 Years 12 Years
SRE 3.36% 53.18% 4.88% 14 Years 26 Years
WMT 0.96% 34.03% 4.41% 51 Years 51 Years
KO 2.86% 67.99% 4.20% 62 Years 62 Years

Let’s say ten years ago, someone bought stock in Coca-Cola. Did they benefit
from this purchase? Or would it have been wiser to invest in a fixed-income
asset, such as a treasury bond, at a rate of around 5%? In July 2025, Coca-Cola's share price was $71.01. As of July 2015, the share price was $41.25.
The stock price grew by more than 5% per year. Add this capital increase to
the dividend, and you will see a higher yield than with safe treasury bonds,
which do not provide capital appreciation.
An individual who bought Coca-Cola stocks worth $100,000 in 2015 can sell
them ten years later for more than $150,000. As of this writing, Coca-Cola
pays $2.04 per share annually, representing a yield of 2.86%. If we calculated
the yield with the price of 10 years ago, we would get 4.6%.
Note
Companies try to increase annual payouts per share over time. Today, Coca-Cola pays $2.04 per share in annual dividends. The further back in time you
go, the less money you would have received per share, while, on average, the
share price was lower. It is often a bad sign for investors if companies reduce
annual payouts per share. Investors can interpret a reduction as a sign that the
company is under pressure and needs to allocate more resources to sustain its
business.
You calculate the dividend yield by dividing the dividend per share by the
share price. Apple has an annual payout per share of 1.04, and the share price
is $203.95 (as of June 2025). 1 / 203.95 yields a dividend of 0.51%. Many
investors will conclude that most tech stocks are growth-oriented companies
that typically pay only a small dividend.

---

## Page 68
Note
The height of a company’s dividend yield depends on the share price, and its
value can be misleading. As of June 2025, AT&T offers a dividend yield of
3.95%, but it will only pay $1.11 per share. At the beginning of 2014, Apple
had a share value of approximately $20, similar to AT&T in 2024. Everyone
who would have purchased 1,000 Apple shares in 2014 for $20,000 would
not only have increased the value of the shares by more than ten times, but
they would also have received a $1,000 dividend payment each year.
Table 2.10 Dividend scorecard from Python data
Ticker Sector Industry Dividend yield Payout ratio
MSFT Technology Software–Infrastructure 0.71 0.2442
WMT Consumer Defensive Discount Stores 0.96 0.3665
NVDA Technology Semiconductors 0.03 0.0129
SRE Utilities Utilities-Diversified 3.36 0.4404
AAPL Technology Consumer Electronics 0.51 0.1558
MO Consumer Defensive Tobacco 6.89 0.6779
VICI Real Estate REIT-Diversified 5.50 0.650
RBI.VI Financial Services Banks-Regional 4.06 0.4297

---

## Page 69
best interest of its shareholders. Some asset types, such as Real Estate
Investment Trusts (REITs), are required by law to have high payout ratios. If
a stock’s payout ratio is low, it is a good sign because it can still experience
significant growth. The longer a company increases its dividend payment per
year, the more likely it is that this trend will continue. Another attractive
attribute is the dividend growth rate. When researching dividend yield, it is
also important to consider historical growth.
Companies have different payment schedules (annual, semi-annual, quarterly,
monthly). A few companies also pay dividends at irregular intervals. If you
plan to use income from dividends for a specific purpose, such as paying for
a summer vacation, carefully consider whether the dividend payment date
aligns with your travel plans.
One related aspect is stock buybacks. In a buyback, a company purchases its
shares from the market, thereby reducing the number of outstanding shares.
Although this action may sound illogical to a newcomer, remember that the
fewer shares there are on the market, the more valuable the remaining shares
will be. A stock buyback is, therefore, an alternative way to reward existing
shareholders without distributing cash. While dividend payments are a
recurring commitment — some investors rely on companies to keep paying
the same amount per year or slightly more each year as a dividend —
buybacks aren’t, giving companies more flexibility.
Dividend yields or coupon payments
Some critics argue that using dividends to generate passive income is unwise,
preferring fixed-income assets, such as bonds, as a more reliable source of
income.
Many investors are unaware that the amount paid per share to shareholders is
also deducted from the share price. If you own 10 shares of Apple and
receive $0.251 per share in a quarterly payment, you will receive $2.51 in
cash, excluding taxes. At the same time, the share price decreases by $0.251
on the payment date. This calculation makes dividend payments appear to be
a zero-sum game compared to bond coupon payments, where the amount
received is guaranteed. If you receive 5% interest on bonds, the value of your
bond position is not affected.

---

## Page 70
Taxation can even result in theoretical losses when dividends are paid. For
instance, non-resident aliens may be subject to a withholding tax of up to
30% on dividends from U.S. companies. Based on the numbers above, when
the dividend is paid, the Apple share price would drop by $0.251. An investor
subject to a 30% withholding tax would lose $0.753 that day. This example
highlights the importance of consulting a tax advisor to understand how taxes
can impact your investment returns.
2.4.7 Ownership
A company's ownership structure is not static and provides key insights into
its valuation. The total number of a company's shares held by all its
shareholders is known as its outstanding shares. A related metric, the float,
refines this number by excluding shares held by insiders and large
institutions, representing the shares available for public trading.
Just as a central bank can influence a currency's value by adjusting the money
supply, a public company can alter its share value by changing the number of
outstanding shares.
- Issuing New Shares: When a company issues additional stock, it increases the total supply, thereby diluting the ownership stake of existing shareholders.
- Share Repurchases (Buybacks): Conversely, when a company repurchases its stock, it reduces the number of outstanding shares, thereby concentrating ownership and potentially increasing the value of the remaining shares.
Monitoring these changes is crucial for understanding the dynamics of a
company's equity.
Analyzing the trading activity of a company's executives, often referred to as
insider transactions, can provide valuable insights into their confidence in the
business. It is crucial to monitor whether key figures are buying or selling
their own company's shares.
Table 2.11, for example, details this activity for NVIDIA. The data indicate
that over the last six months, more insiders have sold shares than have

---

## Page 71
purchased them.
Table 2.11 Looking at insider trading, sample taken on June 8, 2025
Insider Purchases Last 6m Shares Transactions
Purchases 3,914,505.0 17
Sales 2,564,508.0 14
Net Shares Purchases (Sold) 1,349,997.0 31
Total Insider Shares Held 1,057,007,872.0 <NA>
% Net Shares Purchases (Sold) 0.001 <NA>
% Buy Shares 0.004 <NA>
% Sell Shares 0.002 <NA>

As of this writing, Nvidia’s stock rally is a well-known success story. This
success can explain why many Nvidia employees might have sold stocks. It
might have been just an opportunity to reap some benefits of success,
knowing that the share price might decrease. If more insiders sell shares than
buy them, it can be a warning, but it is not yet a single indicator of a problem.
Stock-based compensation and dilution
Many developers have received stock-based compensation (SBC) as part of
their overall package. This incentive allows companies, especially tech firms
and startups, to attract and retain talent and keep salary payments lower while
reducing the burn rate, which states how fast an unprofitable company
consumes its cash reserves.
While SBC can be a wealth-building tool for employees, it can be a source of
dilution as it increases the number of outstanding shares over time. More
shares mean that each existing share represents a smaller slice of the
company.
The smaller the company, the more impact an SBC has. In chapter 11, we

---

## Page 72
will examine private equity and startups, and everyone investing in startups
must be aware of the impact of SBC.
2.4.8 Sustainability
Some investors think beyond potential profits and aim to back companies
with solid social responsibility. Many ethically motivated investors exclude
companies with poor environmental, social, and governance (ESG) ratings, as
investing in a company can also be seen as supporting its practices.
Sustainability data, such as that available on Yahoo Finance, enables this
analysis. These datasets include various metrics, such as flags indicating a
company's involvement in controversial industries, including gambling,
animal testing, or tobacco. They also provide detailed scores across different
ESG categories, which are typically rated on a scale of 0 to 100, where a
lower score indicates better performance.
Table 2.12 shows these ESG ratings for NVIDIA. A key analytical step is to
compare a company to its peers. In this case, the data reveals that NVIDIA's
ESG performance is better than the average for its peer group (other
semiconductor companies), as shown by its lower overall score.
Table 2.12 Selected sustainability ratings of Nvidia collected from Yahoo Finance on June 8, 2025
Metric Value
totalEsg 12.46
environmentScore 2.73
socialScore 4.08
governanceScore 5.65
peerEsgScorePerformance {'min': 8.87, 'avg': 23.06491525423729, 'max': 40.69}
peerGovernancePerformance {'min': 2.14, 'avg': 5.318333333333334, 'max': 9.27}
peerSocialPerformance {'min': 2.41, 'avg': 5.802962962962962, 'max': 10.28}

---

## Page 73
peerEnvironmentPerformance {'min': 2.6, 'avg': 7.885740740740743, 'max': 16.95}

We can also compare Nvidia’s score with that of other companies on
platforms like Sustainalytics (https://www.sustainalytics.com/esg-ratings).
Investors who care about sustainability can also review the ESG reports that
companies regularly publish (https://www.lythouse.com/blog/esg-report-examples-from-leading-organizations-in-multiple-industries). In these pages
and reports, companies periodically share their views on ESG topics and how
they address them.
2.5 External assessments
Investment firms, such as Goldman Sachs, Morgan Stanley, and J.P. Morgan,
exist because they can generate profits with the money of other people. Their
analysts may incorporate many of the discussed ratios into algorithms to
assess companies. Programmers may notice a slight resemblance to open
source at large software companies when these investment firms share some
of their insights with the public. They benefit when some of their work is
publicly available, allowing them to upsell more professional services.
In this section, we examine some of the insights they offer us. In the next
chapter, we will also demonstrate how to collect this data using Python
libraries.
- Ratings: Analysts from reputable investment firms evaluate companies and assign ratings based on their potential for investment. A relatively new trend is crowdsourced financial analysis, in which any investor, including those with minimal experience, can share their investment ideas on a platform.
- Estimated target prices: Based on available financial data, some analysts even estimate target prices for individual companies after one year using statistical analysis and machine learning. However, as many future events are unforeseeable, these estimates are often highly inaccurate.

---

## Page 74
2.5.1 Ratings
Analysts give buy, hold, or sell recommendations to other investors. Table
2.13 shows a list of ratings, which can be found on the investment platform
Seeking Alpha (https://seekingalpha.com/). This data was collected on June
8, 2025, and readers can find updated information at the platform. This figure
shows aggregated ratings of
- SA Analyst Rating: An aggregation of crowdsourced ratings by platform users,
- Wall Street Rating: An aggregation of ratings by professional Wall Street analysts,
- Quant Rating: A rating calculated by an algorithm of Seeking Alpha.

Table 2.13 Ratings of companies based on Seeking Alpha (June 8, 2025)
Symbol SA Analyst Rating Wall Street Rating Quant Rating
NVDA 3.83 4.56 3.38
PFE 3.18 3.56 3.40
AEVA 2.50 4.40 4.99
INVZ - 4.25 3.35
OUST 3.33 5.00 4.50
LAZR 3.25 2.75 2.63
SMR 2.60 4.00 3.47

Table 2.14 Ratings for Nvidia on June 8, 2025
period strong buy buy hold sell strong sell
0m 12 45 6 1 0
-1m 12 44 6 1 0

---

## Page 75
-2m 12 44 7 1 0
-3m 11 27 5 0 0

The result shows that the ratings decreased over time. Some investors will
explore why analysts are gradually losing confidence. Still, the rating overall
is excellent and could convince some investors to buy shares.
2.5.2 Target prices
Table 2.15 also provides 12-month analyst price targets, which are estimates
of a stock's future value. The data for Apple, for example, reflects an average
high target of $300 and a low of $164. Analysts typically derive these figures
using fundamental analysis, such as discounted cash flow (DCF) models,
though their specific methods are often proprietary.
However, investors must approach these targets with caution. Price targets
are estimates, not guarantees, and they inherently assume stable market
conditions while failing to account for unpredictable events. As history has
repeatedly shown, even the most astute analysts can be wrong.
In the next chapter, we will demonstrate how to collect this type of data
programmatically using Python.

Table 2.15 Target prices of selected companies based on June 8, 2025
Ticker Price Mean Price Median Price High Price Low Price rec. Mean rec. Key Nr. of Analysts
AAPL 203.92 228.85 232.5 300.0 170.62 2.1 Buy 40
MSFT 470.38 509.11 500.0 650.0 429.86 1.4 Strong buy 50
NVDA 141.72 172.02 175.0 220.0 100.0 1.44 Strong buy 55
CRM 274.51 354.25 360.0 442.0 225.0 1.7 Buy 52

---

## Page 76
While target prices are useful, studying the history of rating changes can be
even more insightful for understanding the evolution of market sentiment.
Table 2.16 shows an excerpt of this data for NVIDIA, transcribed from
Yahoo Finance on June 8, 2025.
Table 2.16 Upgrades and downgrades of ratings of NVDA from June 8, 2025
Action Broker / Analyst Date
Maintains Truist Securities: Buy to Buy 5/29/2025
Maintains Raymond James: Strong Buy to Strong Buy 5/29/2025
Maintains Piper Sandler: Overweight to Overweight 5/29/2025
Maintains Mizuho: Outperform to Outperform 5/29/2025

Should we trust the judgment of professional analysts for our decision-making? Critics view the favorable ratings of junk bonds by investment firms
in 2007 as a crucial root cause of the mortgage crisis. U.S. taxpayers will also
remember who had to bail out large investment firms after it was revealed
they had been wrong in their assessments. There is no silver bullet to get
guaranteed high returns. Financial investment can be challenging for people
who prefer to think in binary terms, such as right and wrong, or good and
evil. Instead, good investors believe in probabilities.
Treat statements of experts as opinions, not as predictions
At the beginning of 2024, influential newspapers, such as The Economist,
predicted that stock prices would decline that year
(https://www.economist.com/finance-and-economics/2024/02/25/stockmarkets-are-booming-but-the-good-times-are-unlikely-to-last). However, looking at the share prices of some companies,
the opposite happened.

---

## Page 77
Even with all the data in the world, no analyst can predict the future, a fact
best illustrated by the recent history of high-growth stocks. Many investors
deemed companies like Tesla, Nvidia, or Palantir to be overvalued and ripe
for a major correction. Yet, instead of crashing, their share prices often defied
these predictions, either continuing their ascent or entering a prolonged
period of consolidation.
This highlights a fundamental principle of investing: success is not about
being right every time, but about being right more often than wrong. Because
certainty is impossible, investors rely on diversification to manage
probabilities and build a portfolio that can thrive despite inevitable prediction
errors.
2.6 Summary
- The three accounting documents (income statement, balance sheet, and free cash flow) follow accounting standards that help us compare companies.
- Industry classification standards group companies into different sectors (higher granularity) and industries (lower granularity) to facilitate classification and identify peers among companies.
- Investors may interpret ratios differently depending on the company’s sector and industry. They often select ratios for their assessment based on their industry knowledge.
- While it is possible to compare companies across different industries, we obtain the most reliable results through comparisons of companies within the same industry.
- Some metrics help us determine a company’s status independently of its industry, especially those related to solvency, as the question of whether a company can pay its bills is a universal concern for all companies.
- Income statements provide insight into what companies earn during a period.
- The balance sheet provides insight into a company’s assets and liabilities. We can calculate shareholder equity by subtracting the total liabilities from the total assets.
- A free cash flow statement provides insight into a company’s liquidity and is often the basis for calculating liquidity ratios.

---

## Page 78
- Liquidity ratios are calculated mainly from the cash flow statement and reflect a company’s ability to pay bills with its assets. As some assets are not liquid, some companies may have a positive balance sheet but still be unable to pay their bills.
- Debt ratios provide insight into a company’s leverage by comparing its debt and assets. In some extreme cases, these ratios may indicate a pending bankruptcy.
- Earnings ratios measure the company’s profits per share, and we can use them in various ratio calculations, such as the price-to-earnings ratio.
- Profitability ratios assess a business’s ability to generate earnings relative to its revenue, operating costs, balance sheet assets, or shareholders’ equity over time.
- Dividend ratios indicate a company’s commitment to return money to its shareholders in small amounts over various periods.
- Ownership metrics examine changes in a company’s ownership, including insider trading, and can be informative for valuing the company.
- Sustainability metrics evaluate a company's commitment to causes beyond profit-making, encompassing environmental, social, and governance (ESG) considerations.
- We can collect analyst recommendations. However, following the recommendations of third parties without due diligence is a risky approach.
- Ratings are scorecards given by outside organizations to companies. They indicate the potential risks and gains of investing in those companies. Ratings might contradict each other and do not guarantee that the companies’ share prices will rise or fall.
- Target prices are forecasts provided by accredited financial analysts of potential stock prices. These estimates are highly speculative.

---

## Page 79
3 Collecting data
This chapter covers
- Data collection from financial platforms
- The types of data used for financial assessments
- Selecting Python libraries for financial analysis
- Comparing free Python libraries and commercial libraries
- Fundamental and technical analysis using Python

Chapter 2 focused on what we can analyze to make sound investment
decisions. With that knowledge, it is time to show how to collect and explore
data. Some data analysts claim that financial data is cleaner than data from
other domains. Still, even with superb data, we need to invest time in
preparing it for analytical algorithms and determining how to extract insights
most efficiently.
This chapter teaches you how to gather financial data using Python. We'll
focus on yfinance, a powerful open-source library for scraping data from
sources like Yahoo Finance, Google Finance, and Finviz.
While yfinance is excellent for our initial data exploration, we'll also discuss
its limitations and explore more robust, production-ready alternatives. All the
libraries we cover are either free or offer a freemium model.
We'll start by examining the unique characteristics of financial data. Then,
you'll learn to use these Python libraries to collect it. With this knowledge,
you'll be ready for the first use case in chapter 4.
3.1 Financial data
Many data projects, independent of a specific domain, often raise data quality
issues, and it is frequently challenging to predict whether the provided facts
and numbers lead to insights that enable better investment decisions. One
advantage of financial data is that it is regularly audited, and financial

---

## Page 80
statements are required to meet predefined accounting standards. Whether
data analysts receive data from free or paid sources, the information in the
data represents the information that a company's accountants have officially
reported.
This high-quality data is unavailable to analysts working with data in other
fields. Data scientists working with machine data from factories are more
likely to face issues where defective sensors can mismeasure data or multiple
unforeseen environmental conditions might affect results.
Still, people working with financial data may face different challenges in
interpreting data. The purpose of the obligatory accounting statements is to
provide insights about a company's economic situation. However, different
accounting strategies may conceal corporate problems or exaggerate profits.
How accountants present numbers in detail can lead to varying interpretations
of a company's results.
But before we collect the data, let's try to classify it first. To analyze financial
assets, we can divide the data into three categories.
- Fundamental data: Fundamental data does not change regularly within short time frames. Consider regularly published quarterly financial documents, such as income statements, balance sheets, or cash flow statements. They are updated in intervals, such as with quarterly reports. We expect public companies to follow accounting standards, as their reports may be subject to audit. However, the reported data may still contain accounting tricks that make a company's balance sheet appear more favorable.
- Technical data: As a prominent example of technical data, share prices of company stocks change continuously during the open hours of stock exchanges. Many traders try to predict trends from these price movements. As many individuals depend on this data to earn money as day traders, we can also assume that the data is usually reported correctly. While data delivery speed is not crucial for fundamental data, traders who focus on making decisions based on technical data may benefit from receiving data more quickly and executing orders faster. Besides historical share prices of companies, examples of other technical data are trading volume and short interest rates.

---

## Page 81
- Non-Financial data: In the 2010s, big data became a buzzword for all data sources, primarily in unstructured form, that store information that can be mined to find hidden insights. We can analyze data from social media to determine the frequency of mentions of a stock ticker and to identify whether the conversations tend to be positive or negative. ML engineers may use algorithms to analyze executives' emotions when presenting their company's earnings reports to detect potential discrepancies in their statements.

Note
Artificial intelligence algorithms that analyze human emotions in video and
audio streams demonstrate a potential future for investment analysis. For
instance, by processing footage of a company's general assembly, these AI
tools could detect whether employee morale is more positive or negative than
anticipated. Most people will likely agree that this also raises ethical
questions.
Fundamental, technical, and non-financial data differ fundamentally (no pun
intended). While fundamental analysis is primarily based on comparing
financial data between companies within an industry to identify good
investment opportunities, technical analysis is used to make quick trading
decisions that benefit from bullish or bearish market trends. The next step is
to look at the origins of the data.
All roads lead to Rome
This chapter introduces many different platforms and libraries, although they
solve the same generic problems (providing financial information and
interpretations to allow clients to make better investment decisions). It is fair
to ask whether focusing only on one library is sufficient.
Different open-source and commercial platforms may offer varying quality
standards and perspectives on financial data. One framework might meet the
demands of a group of readers, but another framework better suits the needs
of others. Investment decisions can significantly impact our lives; the more
diverse sources we have backing our decision-making, the lower the risk we

---

## Page 82
face.
Before we process data with Python, let's explore some financial platforms
that provide data through a user interface. Although we could load everything
into Python data structures right away, it often helps to use these platforms to
preselect what to explore in depth.
3.2 Financial analysis platforms
Many financial analysis platforms help investors make better decisions by
providing insights into various assets. The scope of these platforms can differ
significantly: some focus on a single asset class, such as stocks or
cryptocurrencies, while others limit their coverage to specific geographic
regions.
Note
We will focus on stocks in this chapter and address bonds and crypto in later
chapters.
Globally, there are around 58,000 publicly listed companies. Given this vast
universe, one of the primary functions of financial platforms is to help users
narrow down choices efficiently. This is where stock screeners come in. A
stock screener is a tool that allows investors to filter listed stocks based on
customizable criteria and displays relevant information on-screen to support
informed decision-making.
Imagine you're an investor with a strong understanding of software
companies. While you already hold many U.S. stocks, you are considering
diversifying internationally. To reduce risk, you focus on companies that are
"too big to fail"—industry giants with massive market capitalizations. Your
strategy is to identify potential candidates and then conduct a more in-depth
analysis of their software offerings and market opportunities.
Many financial analysis platforms offer screeners that allow investors to filter
stocks based on specific criteria. While these tools often share similar
features, investors typically choose based on personal preferences. In this

---

## Page 83
book, we demonstrate how to create a preselection using the platform
FINVIZ.com.
In the example shown in figure 3.1, we screen for technology companies
outside the United States with a market capitalization of over $200 billion,
matching the "mega-cap" category. You can access this filter directly at
finviz.com/screener.ashx?v=111&f=cap_mega%2Cgeo_notusa%2Csec_technology. Please note that
results may vary slightly from those captured in the screenshot on June 16,
2025.
Figure 3.1 FINVIZ.com (https://finviz.com) is one of many financial services platforms that offer
a stock screener to help users find companies through various filters. In this screenshot, we
selected non-US technology companies with a market capitalization of over $ 200 billion and
received three results.
As shown above, stock screeners allow users to filter by various criteria,
functioning like data mining tools. Investors can drill down into individual
companies to explore detailed information. For example, clicking on the link
for SAP provides access to the company's key financials and other relevant
data. Figure 3.2 shows SAP's fundamentals, illustrating just one example of
what can be uncovered during the screening process. Please note that the
level of detail and presentation varies across different financial platforms.
Figure 3.2 Looking at the fundamental data of SAP on Finviz.com

---

## Page 84
A stock screener is like a landing zone or home base for investors. When
individual investors seek specific information about stocks, the platform
might offer advisory services or a more refined analysis as a paid
subscription feature. Table 3.1 categorizes financial platforms.
Table 3.1 Categorization of platforms for developers
Platform category Examples Summary
- Finance pages of a search engine provider: Yahoo Finance, Google Finance, MSN Money. Summary: They provide financial data and insights without asking users to pay for a subscription (except Yahoo Finance premium). In many cases open-source developers create libraries to scrape data (yfinance).
- Financial advisory platform for private investors: Seeking Alpha, Motley Fool, Morningstar, Ziggma, Zacks, Koyfin, Stock Rover, Empower, simplywall.st, TipRanks. Summary: They provide insights on a tiered subscription model ($10 to $350/yr). Only a few provide APIs.

---

## Page 85
- Financial data providers for fintech startups: EODHD, Alpha Vantage, OpenBB. Summary: Provide financial data through APIs. Freemium model available. Commercial packages $240 to $1,200 per year.
- Commercial products for large investment firms: Bloomberg Terminal, Refinitiv, MSCI. Summary: Exceed budget of individual investors. Immense data for analysts and fund managers.

We could use libraries for web scraping and collect financial information
from these platforms if they do not offer an API. However, using a web
scraper means cleaning data and facing the risk of unpredictable errors.
Therefore, we want to load the data into our environment using an API.
Before doing that, we should address some basics about how we want to
process financial data.
3.3 Data science notebooks
Pythonistas and data scientists have worked with Jupyter, Databricks, and
similar platforms that provide notebooks to users. A notebook is an
environment where you can run code in single cells and use the results from
those cells in other cells, providing an interactive environment for engineers.
Appendix A includes a section explaining how to install the relevant tools
necessary for working with data, including Python libraries. However,
addressing "application vs notebook" in advance makes sense. Many software
engineers may consider themselves "app-centric." If they know they can
collect and process data, they might also be tempted to build a UI to display

---

## Page 86
everything to users. In a later chapter, we demonstrate how to do this using
Streamlit; however, this is often not the primary approach to exploring
financial data for personal investment decisions.
For personal financial research, creating frontends might be an unnecessary
overhead. Each investment assessment is a unique research project that may
require research in different data sources. As the goal of a personal
investment decision is to buy, sell, or hold based on data, numbers in a
console would suffice. All programmers might need are data science
notebooks, in which they can write down an investment hypothesis and start
exploring data to prove or disprove their theses. Occasionally, they might
rerun some cells with different data or copy and adjust them for alternative
analyses.
In this chapter, we will introduce libraries and code snippets to analyze some
core investment aspects of companies. In chapter 4, we will continue to apply
this knowledge to identify concrete investment opportunities. Until then,
become familiar with the development environment of your choice and
become accustomed to working with data science notebooks. The code
presented in this chapter can also be found in the book's downloads and the
Git repository.
3.4 yfinance
Pick a random book covering financial data exploration with Python or look
for relevant code snippets online; most likely, you will find code that collects
data through the library yfinance. This library is the perfect starting point for
exploring financial data by experimentation.
The yfinance library enables developers to load a wide range of data from the
Yahoo Finance platform into Python data structures. Therefore, for a
programmer getting started with exploring financial data, yfinance is the best
choice. We can use yfinance for technical and fundamental analysis.
Note
A stock ticker is a unique company identifier on a stock exchange. NVDA for

---

## Page 87
Nvidia, AAPL for Apple, and so on. For international exchanges, platforms
add an acronym for the stock exchange. So, if we use Yahoo Finance, we find
Rolls-Royce listed as RR.L on the London Stock Exchange, or Allianz SE as
ALV.DE on the Frankfurt Stock Exchange. We need to watch out for
mismatches, as there is, for instance, a ticker ALV registered on the NYSE.
Unfortunately, the acronyms to identify stock exchanges may differ between
APIs. We will show in a later example that another library, EODHD, uses
LSE as an identifier for the London Stock Exchange.
3.4.1 Fundamental analysis
Programmers can retrieve a company's accounting data, introduced in chapter
2, using yfinance and the code snippets below. This DataFrame contains all
the information a company provides when reporting this data, such as
aggregated sales figures over time. In this example, we used Microsoft.
MSFT is Microsoft's stock ticker, a unique identifier for the company on the
NASDAQ stock exchange, where Microsoft is listed.

```python
import yfinance as yf
microsoft = yf.Ticker('MSFT')
microsoft.income_stmt
microsoft.balance_sheet
microsoft.cash_flow
```

For each of the fetched properties of the microsoft object, the returned object
is a DataFrame representing an accounting statement with the reporting dates
as columns and the metric for each report as a row. Figure 3.3 shows the
output of the DataFrame returned by the property income_stmt. The
properties balance_sheet and cash_flow would return data in the same data
structure, but with different values representing the accounting statements.
Table 3.2 The income statement of Microsoft in a DataFrame (transcribed reference data)

---

## Page 88
Table 3.2 (Cont.)
- Tax Effect Of Unusual Items: 2024-06-30: -99918000.0, 2023-06-30: -2850000.0, 2022-06-30: 43754000.0, 2021-06-30: 180160797.16
- Tax Rate: 0.182, 0.19, 0.131, 0.138266
- Normalized EBITDA: 133558000000.0, 105155000000.0, 99905000000.0, 83031000000.0
- Total Unusual Item: -549000000.0, -15000000.0, 334000000.0, 1303000000.0
- Net Income From Continuing Operational Net: 88136000000.0, 72361000000.0, 72738000000.0, 61271000000.0
- Reconciled Depreciation: 22287000000.0, 13861000000.0, 14461000000.0, 11686000000.0
- Reconciled Cost of Revenue: 74114000000.0, 65863000000.0, 62650000000.0, 52232000000.0
- EBITDA: 133009000000.0, 105140000000.0, 100239000000.0, 85134000000.0
- EBIT: 110722000000.0, 91279000000.0, 85779000000.0, 73448000000.0

We can access the specific information in financial account statements by
referring to the data and the specific identifier of the information we are
looking for, as shown in the example below.
`microsoft.income_stmt["2024-06-30"]["EBITDA"]`
Users who explore the content of an object's attribute can iterate through
columns representing report filing dates. Programmers interested in the
quarterly results of the three account statements can also use the same
approach by calling an attribute with the identifier quarterly_ followed by
the identifier of the accounting statement, as shown in the code sample
below.
`microsoft.quarterly_income_stmt`

---

## Page 89
```python
microsoft.quarterly_balance_sheet
microsoft.quarterly_cash_flow
```

In chapter 2, we introduced several financial ratios. Collecting financial ratios
of companies with Python is easy, as most ratios can be obtained through
attributes from simple objects populated using the functionality of yfinance.
We continue with the object microsoft. The microsoft.info property is an
object of the type dictionary. Converting it into a Pandas series allows us to
access the information referenced by the dictionary's keys as attributes of the
newly generated object.

```python
import pandas as pd
info = pd.Series(microsoft.info)
```

This info object contains numerous attributes related to corporate
information, including headquarters address and financial ratios, such as the
P/E value. When writing this book, the library offered 132 attributes to
explore. The code below returns the details of what can be queried.
`print(', '.join(info.keys()))`
Accessing that one attribute is a one-liner. Below, we collect Microsoft's
current share price.
`info.currentPrice`
We define a small helper function to collect the companies' ratios. The
snippet below returns a DataFrame containing a list of ratios we pass as
identifiers.

```python
import pandas as pd
import yfinance as yf

def collect_ratios(tickers: list, ratios: list):
    rows = []
    for ticker in tickers:
        info = yf.Ticker(ticker).info
        row = [ticker] + [info.get(ratio, None) for ratio in ratios]
        rows.append(row)
    return pd.DataFrame(rows, columns=["Ticker"] + ratios)
```

---

## Page 90
In chapter 2, we present various results of queries transcribed in tables. The
collect_ratios method makes it easy to get multiple ratios. In the code
below, we collect the current and quick ratios of four companies
(Walmart(WMT), Altria(MO), Nvidia (NVDA), and Salesforce(CRM)). We
also add the sector and industry to the output.

`collect_ratios(["WMT", "MO", "NVDA", "CRM"], ["sector", "industry", "currentRatio", "quickRatio"])`

The output of these methods can be reviewed in chapter 2, as we have used
this method to collect all the data for the ratios that have been introduced
there. Using this method, we can collect more ratios and analysis using
attributes, such as debtToEquity, forwardPE, trailingPE, pegRatio,
priceToSalesTrailing12Months, priceToBook, beta, or
recommendations_summary. The book contains a data science notebook
called Ratios, which includes a set of reference commands to generate the
results for the ratios as shown in chapter 2. Feel free to explore them and
choose companies that interest you.
It is time to discuss some ratios we introduced in chapter 2 that are not
provided as attributes. First, we need to collect a ticker. We will also collect
references to the latest accounting statements as they are returned to us, in a
DataFrame where columns represent the reporting dates.

```python
import yfinance as yf
company = yf.Ticker("MSFT")
col_latest_inc_stmt = company.income_stmt.columns[0]
col_latest_bs = company.balance_sheet.columns[0]
```

As shown in table 3.3, we can use code to collect the information. Please note
that we reference specific financial accounting documents at a particular date,
and you may need to adjust the dates accordingly.
Table 3.3 shows how to collect specific ratios using the collected object and helper functions.
- ROA: `company.income_stmt[col_latest_inc_stmt]["Net Income"]/company.balance_sheet[col_latest_bs]["Total Assets"] * 100`
- ROE: `company.income_stmt[col_latest_inc_stmt]["Net Income"]/company.balance_sheet[col_latest_bs]["Stockholders Equity"] * 100`

---

## Page 91
- Profit Margin: `company.income_stmt[col_latest_inc_stmt]["Net Income"]/company.income_stmt[col_latest_inc_stmt]["Total Revenue"] * 100`
- Asset Turnover Ratio: `company.income_stmt[col_latest_inc_stmt]["Total Revenue"]/company.balance_sheet[col_latest_bs]["Total Assets"]`
- Debt-to-Equity: `company.balance_sheet[col_latest_bs]['Total Debt']/company.balance_sheet[col_latest_bs]['Stockholders Equity']`

Another interesting fact is the development of ratios over time. Apple has a
higher debt-to-equity ratio than its peers. This is likely to be related to
accounting practices. However, it could be a bad sign if the last value
suddenly rises significantly. The code below indicates that this ratio
fluctuates within years—in 2021, 2.16, in 2022, 2.61, in 2023, 1.78, and in
2024, 1.87—and we can conclude that this debt-to-equity ratio will not
prevent us from making an investment decision.

```python
company = yf.Ticker("AAPL")
for i in range(0,4):
    print(f"{company.balance_sheet.iloc[:,i].name}: {company.balance_sheet.iloc[:,i]['Total Debt']/company.balance_sheet.iloc[:,i]['Stockholders Equity']}")
```

3.4.2 Technical analysis
We can use yfinance to examine time series data. In the example below, we
load Microsoft's historical stock data into a DataFrame for one year, as shown
in table 3.4. In the code below, we load the data for one year by executing
this query.

```python
import yfinance as yf
historical_data = yf.Ticker("MSFT").history(start="2024-05-08", end="2025-05-08")
historical_data
```

Table 3.4 Historical price data of Microsoft (June 8, 2025 sample)
Date Open High Low Close Volume
2025-05-07 00:00:00-04:00 433.05 437.32 430.32 432.56 23295300

---

## Page 92
2025-05-06 00:00:00-04:00 431.41 436.93 430.38 432.52 15104200
2025-05-05 00:00:00-04:00 432.08 438.69 431.32 435.37 20136100
2025-05-02 00:00:00-04:00 430.95 438.63 429.20 434.48 30757400
2025-05-01 00:00:00-04:00 430.32 436.19 424.12 424.62 58938100

Occasionally, we prefer to have exact time intervals; in the code below, we
show how to collect data for 2023. The source code output below would
return the same data structure as in figure 3.4, with different dates and values.

```python
import yfinance as yf
hd_msft_2023 = yf.Ticker("MSFT").history(start="2023-01-01", end="2023-12-31")
hd_msft_2023
```

The everyday use case leverages technical data to explore how stock prices
evolve. How is the spread between highs and lows, and how volatile is the
stock? The more volatile the share price has been in the past, the higher the
likelihood that it will continue to be erratic.
Note
Past performance does not guarantee future results. However, if you take
several stocks with stable past performance and put them in a portfolio, you
can absorb single stocks performing below expectations. Providing risk-optimized portfolios is often the domain of exchange-traded funds(ETFs).
In chapter 2, we concluded that the share prices of companies from the
consumer staples sector, such as Coca-Cola, are likely more stable. This
sector represents goods for everyday needs, but consumers will also purchase
during crises. If we compare Coca-Cola with a startup, we can see this
difference in the numbers. Let's load the required data and compare Coca-Cola with NuScale (SMR), a company focusing on building small modular
reactors. We also add Apple to the portfolio to diversify our baseline with a
third company.

---

## Page 93
```python
import yfinance as yf
hist_prices_2023 = yf.Tickers(["AAPL", "SMR", "KO"]).history(start="2023-01-01", end="2023-12-31")
```

The share prices of different stocks do not give us a basis for comparing
stocks. Company A might be traded at $1000 per share, and Company B at
$10. The price is just a number without the number of shares outstanding.
Companies with high share prices often consider a share split to reduce the
cost of purchasing a single share. If Company A decided to split the shares in
a 1:10 ratio, and you held one share, after the split, you would have ten shares
of stock with a share price of 100. Therefore, we need to set a starting date
for our comparison and assume the price of each company starts at 100%,
from which we track the price changes in percentage terms.
NuScale's share price could have been better in 2023. We will plot the share
prices as a percentage over time to illustrate this. The code below extracts the
closing prices and creates a data frame with the percentage changes for each
ticker at the beginning of the period. Please note that you may need to install
the Matplotlib library.

```python
def plot_closing_prices(data):
    import matplotlib.pyplot as plt
    close_prices = data["Close"]
    price_change_in_percentage = (close_prices / close_prices.iloc[0]) * 100
    price_change_in_percentage.plot(figsize=(12,8), fontsize=12)
    plt.ylabel("Percentage")
    plt.title("Price Chart", fontsize=15)
    plt.show()
```

Calling this method with the DataFrame as a parameter, such as by
`plot_closing_prices(hist_prices)`, we can generate a plot, as shown in
figure 3.3 below.
Figure 3.3 The share price development of Apple(AAPL), Coca-Cola(KO), and NuScale(SMR).

---

## Page 94
If you looked purely at 2023, you might be tempted to say that it would be
wise to invest in Apple and short-sell NuScale. However, if you look at the

---

## Page 95
results of 2024, in which the share price of SMR soared, this would have
been a disastrous decision. Figure 3.4 shows the results if we picked the stock
starting from November 22 and one year back.

```python
import yfinance as yf
hd_nvda_smr_aapl_1yr = yf.Tickers(["AAPL", "SMR", "KO"]).history(start="2023-11-22", end="2024-11-22")
plot_closing_prices(hd_nvda_smr_aapl_1yr)
```
Figure 3.4 The share price development of Apple(AAPL), Coca-Cola(KO) and Nuscale(SMR) in 2024

---

## Page 96
In chapter 4, we will explore more details on how to identify other
companies, such as NuScale, that can grow stronger than the market. Let's
begin by exploring the market returns. We have the closing price of a share

---

## Page 97
and can compare it with the previous day's price. With that, we can calculate
daily returns.

```python
simple_returns = hist_prices_24["Close"].pct_change(fill_method=None).dropna()
simple_returns
```

Returns calculated this way are called simple returns. A second method for
calculating returns is using logarithmic returns. Instead of subtracting the end
price from the starting price, we use log functions.

```python
import numpy as np
log_rets = hist_prices_24["Close"].apply(lambda x: np.log(x / x.shift(1))).dropna()
log_rets
```

Logarithmic returns have found broad application in calculating returns
compared to simple returns, which we would obtain if we simply subtracted
the previous day's closing price from the current day's closing price.
Logarithmic returns differ in that they measure the continuous compounded
rate of returns, which is more beneficial for statistical analysis. We can also
plot the returns in a histogram to discover how often we had outliers. Figure
3.5 shows the results.

```python
log_rets_2023 = hist_prices_2023["Close"].apply(lambda x: np.log(x / x.shift(1))).dropna()
log_rets_2023.hist(bins=35, figsize=(10, 6))
```
Figure 3.5 The histogram of the returns for Apple, Coca-Cola, and NuScale.

---

## Page 98
To finalize our primer on technical analysis, let's look at three standard
metrics: mean, standard deviation, and variance. Again, we use a snippet here
to visualize the differences between these statistical methods. Table 3.5
shows the results.

---

## Page 99
```python
summary = log_rets_2023.agg(["mean", "std", "var"]).T
summary.columns = ["Mean", "Std", "Var"]
summary
```

Table 3.5 Transcribed statistics for Apple, Coca-Cola, and NuScale based on 2023 data
Ticker mean std var
KO -0.035349 0.134959 0.018214
AAPL 0.442217 0.199222 0.039690
SMR -1.149094 0.799615 0.639385

The mean is the average stock price over the given period, representing the
"central" value of the dataset. Variance measures how far each price deviates
from the mean in squared units. The standard deviation is the square root of
the variance, bringing the measure back to the same units as the prices.
The data shows that NuScale exhibits significant fluctuations. However,
someone who in 2023 made a short-term bet on Coca-Cola would have been
disappointed as well. These metrics already give us an idea about the
performance of stocks. In later chapters, we will delve into more detail and
demonstrate how to determine if stocks in a portfolio correlate.
3.4.3 Limitations of yfinance
Digging into the source code of the yfinance code on GitHub, we see that it
utilizes web scraping frameworks, such as Beautiful Soup. On the landing
page, the author introduces this library as a wrapper for Yahoo's internal API,
highlighting that Yahoo does not maintain the yfinance library. For
developers who rely on getting valid results, this scenario poses a risk. Yahoo
is unlikely to inform the maintainers of an open-source product that scrapes
its data about upcoming changes. In the worst case, Yahoo might even
decide, at some point, to implement anti-scraping methods to restrict access
to its financial data at any time.
As shown in figure 3.6, sustainability data was not supported with a version
of yfinance in the middle of 2024. Programmers who wanted to incorporate
sustainability data into their analysis would have to use a different library.

---

## Page 100
Figure 3.6 Initial limitations of yfinance with sustainability data. Please note that this problem is
gone with newer versions.
The good news is that with the latest version of yfinance, this problem
disappeared. Still, yfinance depends on Yahoo's benevolence. It is essential to
know alternative products.
3.5 Commercial libraries
For many personal investment assessments, yfinance is just fine. While
commercial libraries primarily target companies seeking to develop their
financial products, there are still compelling reasons for private investors to
collaborate with these libraries.
The freemium model of commercial libraries encompasses certain aspects of
analysis for personal use. If, for instance, the limitation of a free plan is that
some data arrives delayed or you have a limited quota of API calls, you might
still run some algorithms on stocks in your portfolio. In this book, we
primarily use yfinance, but in some examples later, we will utilize some of
these commercial libraries in their freemium versions, where it makes sense.
Note
Commercial libraries require you to create API keys. In appendix A, we show

---

## Page 101
a general approach to working with API keys.
Before we explore commercial libraries, let's see how the ideal data provision
works. Scraping data from a UI, as in yfinance, adds risks and overhead. The
moment the UI structure changes, we may need to adjust our code to scrape
the platform. One risk that users of yfinance face is that Yahoo could change
its policy to allow an open-source library to scrape its data. While we can
transition as private investors to a different library, some of us prefer not to
make that effort and are ready to pay a small sum for a commercial product,
especially if it helps us generate better returns.
The root for technical data is the exchange that lists the stocks we are
interested in. As we have many exchanges, various entities provide data from
different sources. We must remember that we also have international
exchanges, in addition to U.S. exchanges, and collect data from all over the
world. Each of these exchanges may provide different APIs and standards.
We need to dedicate some effort to maintaining the data collection process if
we aim to build a commercial library that provides data from all exchanges.
Financial providers and their data providers
Yahoo Finance statistics (https://finance.yahoo.com/quote/AAPL/key-statistics) confirm that Yahoo Finance uses data providers like Refinitiv,
Edgar Online, and Morning Star to collect information. The provider
EODHD (https://eodhd.com/) claims in its FAQ that it collects data through
direct contracts with various exchanges. They also collect fundamental data
from financial news providers, corporate websites, and annual reports, with
direct extraction from sec.gov for the USA and sedar.com for Canada.
Fundamental data is extracted from accounting statements; the best source is
to load data from those entities where the data is filed. This information
should be available to the public anyway. Let's examine Figure 3.7, which
illustrates a reference process.
Figure 3.7 In a slightly simplified way, users can collect data from financial data providers, who
collect technical data from one or more exchanges per country and one regulator per country.

---

## Page 102
Data providers collect data from exchanges and government agencies. While
accounting statements are filed quarterly, share prices change frequently
during an exchange's opening times, so data from exchanges is likely a
streaming source.
Note
We can integrate generative AI platforms into our source code, submit
prompts, and interpret results using frameworks like LangChain. LLMs and

---

## Page 103
AI agents will eventually transform the way we analyze investments. For
now, being able to collect data to obtain reproducible results deterministically
is a use case that GenAI has not yet replaced.
Many companies provide financial data to consumers. Some, such as
Refinitiv and Morgan Stanley, are focused on a B2B business. In this book,
we focus on four providers that may be of interest to startups. Table 3.6 lists
them.
Table 3.6 APIs and their packages
Platform Packages
Finviz Elite subscription costs $24.96 per month
EODHD Packages range from $0 to $199.00 per month.
Alpha Vantage Packages range from $0 to $249.99 per month.
OpenBB Pricing not disclosed

3.5.1 Finviz
Finviz is a popular financial platform best known for its feature-rich stock
screener on their webpage, as shown in figure 3.8. The major downside of
this platform is that it only provides data for companies listed on U.S.
exchanges. Since Finviz is popular among investors and often featured in
finance training videos, it still makes sense to introduce the API to users who
plan to invest only in the U.S. and appreciate the stock screener's richness.
However, we will not use this API for samples in the book.
Figure 3.8 Finviz stock screener home page showing various tickers

---

## Page 104
Finviz offers a paid subscription called Finviz Elite. This subscription offers
an API. You can set up an authentication token to parse the screener as
shown in figure 3.9.
Figure 3.9 Finviz screen that explains how to use the API

---

## Page 105
After generating a token, we can access stock data. In this example, we can
use the code below to access Finviz and export data to a CSV file. We use a
REST API to collect information about the stock. It exports all data based on
predefined filters, allowing us to collect fundamental data. Please note that to
execute the code below, you need to define a variable token that contains
your access token. This token is required for multiple requests to collect data
from Finviz.

```python
import requests
URL = f"https://elite.finviz.com/export.ashx?[allYourFilters]&auth={token}"
response = requests.get(URL)
open("export.csv", "wb").write(response.content)
```

The commercial Finviz API also lets users collect data for the portfolios they
create on the platform. Figure 3.10 shows a sample portfolio in Finviz. A
portfolio is a list of stocks a user tracks to which they can add the number of
shares they own. With that, you can quickly run a personalized portfolio
analysis if you have already tracked your portfolio on Finviz.

---

## Page 106
Figure 3.10 Example portfolio with Finviz containing assets associated with climate change.
A unique ID identifies every user portfolio. Using the paid Finviz API, users
can collect data via the following URL by passing the portfolio ID as a
variable.
`https://elite.finviz.com/portfolio_export.ashx?pid={pid}&o=price&auth={token}`
PyPI lists alternative and free libraries that scrape Finviz data without using
Finviz's paid service. These libraries follow the same strategy as yfinance:
They scrape data from the web and return data in pandas DataFrames. These
libraries also share the same risks as yfinance. If the financial platform
deploys anti-scraping methods, the libraries become unusable.

---

## Page 107
Finviz users might observe that stocks of companies with a headquarters
outside the USA are displayed, even though Finviz only supports U.S. stock
markets. For example, users may be able to explore a Danish company that
produces weight loss drugs (Novo Nordisk), but they do not see a large
windmill producer from Denmark (Ørsted A/S). The reason is American
Depositary Receipts (ADRs), which mirror a stock from a foreign exchange
to the U.S. exchange. However, this vehicle has downsides, including
dividend custody fees and other risks.
The paid Finviz API may be a suitable alternative for investors who primarily
use U.S. stock exchanges and wish to avoid potential long-term risks
associated with incompatibilities with open-source libraries. Still, we must
continue our search, as we need a library that covers a wide range of stock
exchanges.
3.5.2 EODHD
Finviz and yfinance, the libraries we explored so far, attract users with
powerful UIs that provide stock screening functionality and add libraries to
collect data as an additional feature. EODHD, in contrast, is a platform where
data provision is the primary business model.
EODHD offers a freemium model. The free version provides historical data
from the previous year. It is limited to 20 API calls per day, which may be
helpful to private investors who run analyses on their data infrequently. The
paid subscription helps programmers build a product that expects many API
calls from clients, as their pricing data includes features such as 100,000 API
calls per day or 1,000 API requests per minute.
The first part of the code below is self-explanatory. We instantiate a client
object using an API key as a parameter that identifies us. The platform then
determines whether we are authorized to use specific features based on our
subscription model. Please refer to Appendix A for more information on API
keys.

```python
from eodhd import APIClient
client = APIClient(api_key)
```

---

## Page 108
The biggest challenge with the library Finviz was that it only supported U.S.
exchanges. Let's confirm that we are not limited in such a way using
EODHD. We run code to collect the number of exchanges, and we will
obtain 77 exchanges connected to this platform, as shown in table 3.7.
`client.get_exchanges()`

Table 3.7 Query returning exchanges for EODHD
Name Code OperatingMIC Country Currency CountryISO02
USA Stocks US XNAS, XNYS, OTCM USA USD US
London Exchange LSE XLON UK GBP GB
Toronto Exchange TO XTSE Canada CAD CA
TSX Venture Exchange V XTSX Canada CAD CA
NEO Exchange NEO NEOE Canada CAD CA

With 77 exchanges, we can build a product that caters to the international
market. Let's load some historical data from Rolls-Royce on the London
Stock Exchange and display the results in table 3.8.

```python
resp = client.get_eod_historical_stock_market_data(symbol='RR.LSE', period='d')
df = pd.DataFrame(resp)
df
```

Table 3.8 EODHD data for Rolls-Royce from London Stock Exchange
date open high low close Adjusted close
2024-06-03 459.30 468.10 458.60 460.90 460.90

---

## Page 109
2024-06-04 460.20 462.70 448.00 448.00 448.00
2024-06-05 450.70 458.00 448.80 453.30 453.30
2024-06-06 458.00 463.10 450.50 458.20 458.20
2024-06-07 458.20 462.30 451.00 456.90 456.90

Comparing the results of this DataFrame with the DataFrame of yfinance
reveals that both have a similar column structure. If we are willing to pay for
EODHD as a data provider, we would eliminate these limitations and be able
to switch from yfinance to EODHD without having to rewrite a lot of code,
as the interfaces are similar.
3.5.3 Alpha Vantage
Like EODHD, Alpha Vantage's primary business model is to provide
financial data via an API. The provider offers a free package and advanced
services through a paid subscription.
Let's collect some time series data. In this example, we load data from Apple.
As with EODHD, we need a key that authenticates us. We will get access to
more data if we upgrade our key with a paid subscription.

```python
from alpha_vantage.timeseries import TimeSeries
import pandas as pd
symbol = 'AAPL'
ts = TimeSeries(key)
data, meta_data = ts.get_daily(symbol=symbol)
df = pd.DataFrame(data)
df
```

The result is again a DataFrame, as shown in table 3.9. However, the columns
and rows are displayed transposed by default in EODHD and yfinance.

---

## Page 110
Table 3.9 Alpha Vantage daily time series (inverted)
Date 2025-06-06 2025-06-05 2025-06-04 2025-06-03 2025-06-02 2025-05-30
1 Open 203.0000 203.5000 202.9100 201.3500 200.2800 199.3700
2 High 205.7000 204.7500 206.2400 203.7700 202.1300 201.9600
3 Low 202.0500 200.1500 202.1000 200.9550 200.1200 196.7800
4 Close 203.9200 200.6300 202.8200 203.2700 201.7000 200.8500
5 volume 46607693 55221235 43603985 46381567 35423294 70819942

Luckily, transforming to the style of Yahoo Finance and EODHD requires
only one command, `df.T`, and the results are shown in table 3.10.

Table 3.10 Transposed Alpha Vantage data
Date open high low close volume
2025-06-06 203.0000 205.7000 202.0500 203.9200 46607693
2025-06-05 203.5000 203.5000 200.1500 200.6300 55221235
2025-06-04 202.9100 206.2400 202.1000 202.8200 43603985

There is one hidden limitation. Many platforms return two different data sets
for the closing price: the adjusted close and the close price. The adjusted
close price returns data are adjusted for stock splits and dividend payouts.
The good news is that we can obtain the adjusted close price using an
alternative method. However, this method is part of a premium service.
Calling the method below without a subscription would only return a
message that tells us to subscribe to a premium service.

`data, meta_data = ts.get_daily_adjusted(symbol, outputsize='full')`

The free package includes another feature that may be of interest to
programmers. The following code collects news sentiments through the
REST API from Alpha Vantage and stores them in a DataFrame. For this
code example, we use the ticker SMR, which represents the stock of NuScale

---

## Page 111
Power, a nuclear energy company that builds so-called Small Modular
Reactors (SMRs). Figure 3.11 shows the output of this query.

```python
import requests
import pandas as pd
ticker = 'SMR'
url = f'https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers={ticker}&apikey={key}'
r = requests.get(url)
data = r.json()['feed']
df = pd.DataFrame.from_dict(data)
df
```

Figure 3.11 The sentiment analysis results for the nuclear energy company NuScale.
3.5.4 OpenBB
OpenBB integrates various asset classes beyond stocks. However, first, let's
demonstrate how to collect data using methods similar to those employed by
other libraries. Using two lines, we collect technical data on a stock.
Note
When writing this book, the OpenBB library does not yet support the latest

---

## Page 112
available Python version (3.13). Users who want to explore this library can
use Python version 3.12.

```python
from openbb import obb
obb.equity.price.historical("NVDA").to_df().head()
```

Table 3.11 Retrieving technical data through OpenBB
date open high low close volume
2023-06-26 42.460999 42.76400 40.099998 40.632000 594322000
2023-06-27 40.799000 41.93999 40.448002 41.875999 4621750000
2023-06-28 40.660000 41.845001 40.518002 41.117001 582639000
2023-06-29 41.557999 41.599998 40.599998 40.821999 380514000
2023-06-30 41.680000 42.549999 41.500999 42.301998 501148000

Let's focus on this API's differentiator. The code below shows how to
integrate multiple data providers into this API. We can work with various
providers in theory, which increases our possibilities by allowing us to switch
from one provider to another without requiring any code changes.

`obb.equity.price.historical("NVDA", provider="yfinance").to_df().head()`

But this does not end here. So far, we have been focused on stock
information, but as we learned in chapter 1, the financial universe consists of
many assets. Let's look at the self-explanatory snippets below. Using this
library, we also get access to other assets.

```python
obb.currency.price.historical("USDGBP").to_df().head()
obb.fixedincome.government.treasury_rates(start_date="2024-01-02").to_df()
obb.crypto.price.historical("SOLUSD").to_df().tail()
```

---

## Page 113
OpenBB might be the best library for programmers who want to explore
markets other than stocks; they could choose this library.
3.6 Other libraries
The Awesome Quant GitHub page at
https://github.com/wilsonfreitas/awesome-quant provides a comprehensive
list of alternatives for collecting financial data. However, rewriting the code
can be time-consuming if we choose libraries and later find out that they do
not meet our expectations.
One parameter to see if the library meets today's standards is the day of its
last update. The PyPi web page is a commonly used repository for Python
libraries and provides this information. All we need to do is look at the
library's page, as shown with yfinance below.
https://pypi.org/project/yfinance/
We can see regular releases in the PyPI release history page. Another source
of information is a library's GitHub repository, where the library's source
code is hosted. We can look for the dates of the most recent commits. Below
is the link to the yfinance repository.
https://github.com/ranaroussi/yfinance
One rule of thumb is to use a library that has been updated within the last
year. New Python versions are being released, and financial platforms are
changing their interfaces. At some point, a library may become incompatible
if nobody is left to maintain it. For that reason, we want libraries with
multiple contributors. We should also compare libraries by the number of
stars and forks and select more popular libraries, as this indicates a
substantial likelihood of attracting new contributors.
We aim to filter the existing library repository to identify further possible
limitations. Let's set some further criteria.
- Some libraries require system-specific software and may only support specific operating systems. We want libraries that run on most

---

## Page 114
platforms.
- Some APIs are designed specifically for stock exchanges in a single country. We look for libraries that support as many stock exchanges as possible.
- Although English is the default language for most projects, we may encounter projects that use a different documentation language. We want to exclude these projects.
For this book, we will focus as much as possible on yfinance. It is the best-known API for investment analysis, and readers will find tons of snippets and
advice to extend the code they write.
3.7 Summary
- We can categorize data into three groups: fundamental, technical, and non-financial.
- Data science notebooks are ideal for analyzing individual stocks, as their interactive nature allows you to explore data and discover insights rapidly.
- Fundamental analysis involves examining financial reports and ratios.
- Technical analysis involves analyzing asset prices to inform sound investment decisions.
- Non-financial analysis encompasses all data unrelated to technical and fundamental analysis and may, for instance, include sentiment analysis about a company.
- Different libraries offer different advantages and have other constraints. It is good to know more than one library to load financial data.
- Yfinance is the best library for beginners experimenting with financial data. It is free. It provides stock data from numerous exchanges (both U.S. and non-U.S.) for fundamental and technical analysis.
- Using the yfinance library for professional financial products is risky because Yahoo does not officially support it. Any changes to the Yahoo Finance platform can cause the library to break without warning.
- To build a commercial product using financial data, you need libraries that offer a paid subscription and provide service guarantees. EODHD, Finviz, Alpha Vantage, and OpenBB are candidates that could be explored in more detail.

---

## Page 115
- Finviz provides an API on a paid subscription basis and supports only stocks listed on U.S. exchanges. It can be a good option for investors who plan to invest only in the U.S. market.
- EODHD is a commercial data provider that offers a free version with limited API calls, supporting many exchanges. If you have a limited number of daily calls, use the free EODHD version.
- Alpha Vantage is a commercial data provider with a limited free version. One challenge with the free API is that it does not provide adjusted close prices. Alpha Vantage allows you to collect news sentiments through its library, making it unique among similar libraries.
- OpenBB is a commercial data provider that offers access to a wide range of assets beyond stocks, including bonds, cryptocurrencies, and foreign exchange markets. Use this library if you are interested in more generic investment strategies and are not limited to investing in stocks.

---

## Page 116
4 Growth portfolios
This chapter covers
- What is an investment thesis to predict growth companies?
- How do you create a portfolio that reflects an investment thesis?
- How do you find specific assets that reflect your thesis for your portfolio?
- How do you decide to take the required risks to pursue potential gains?

This chapter explores the process of building an asset portfolio designed to
outperform the market. Finding these winners, or alphas as they are often
called, is the holy grail of investing. A stock picker who consistently is just
slightly more right than wrong may have already gained Midas’ touch.
Many investors distinguish between gambling and investing when making
decisions about trading assets. We are excited about potential investment
ideas that could make us wealthy. And as these dreams of joining the club of
Warren Buffett are overly pleasant, we tend to downplay doubts that threaten
to undermine this endearing feeling of getting rich soon. Gambling begins
when we rely more on feelings than on critical thinking when making
investment decisions. With only a little research, we find suitable candidates
for investments. The tricky part is conducting the required deep research to
identify those candidates for an investment that truly yield a return.
At the age of ten, I joined a chess club. As I had started playing chess earlier
than my peers, I was more skilled at seeing combinations, such as forks, to
capture my opponents’ pieces, which allowed me to win most of my games.
My chess teacher saw me moving around and waiting for my opponent to
make a mistake. He took me aside and told me: “If you just rely on someone
else to make a mistake to win, you will lose against better players. You need
a strategy to win a game. Even a bad plan is better than no plan.” He turned
out to be right. Better players with a strategy roasted me on the chessboard. I
quickly learned an indispensable principle of learning that can also be applied
in investing: research, plan, execute, reflect, and adjust. With that strategy,

---

## Page 117
learning from mistakes and coming out stronger is a necessary part of
achieving long-term success. Let’s explore how we can invest with a plan.
We begin with a case study for a specific domain, and then we extract the
lessons learned from that case study to create a generic approach to
researching investments.
4.1 Investment thesis
An investment thesis is a researched theory about a stock’s predicted
performance. We face many possible scenarios. Some share prices have
performed poorly, and we consider them undervalued, betting on a
turnaround. Other stocks may provide a solid income through steadily
growing dividends, and we believe this trend will continue. And, of course,
we might also bet against companies and short-sell assets that we consider
overvalued. In this chapter, we aim to showcase one of these many possible
scenarios, focusing on companies poised for growth and expansion.
Creators of an investment thesis must be able to defend their reasoning and
allow, or even better, invite others to challenge their ideas. The more
unbiased experts peer-review the thesis, the better. Let’s start this
investigation with the idea that we will refine until we identify a group of
assets to purchase. One essential aspect of buying assets is defining goals to
understand from the start and having a guideline for holding or selling the
asset in the future.
Note
The chapter’s focus is to outline a process for finding stocks, not to promote a
specific set of stocks for you to purchase. You may continue to conduct your
own extended research based on insights from this chapter. What remains
crucial is that you only invest in businesses you understand.
4.1.1 Starting with an idea
Chapter 2 outlined that businesses can vary significantly from one another.
Different business models pose different challenges. Everyone gained
mastery in a few domains. We become aware of the Dunning-Kruger effect—

---

## Page 118
a cognitive bias where people with low ability in a specific area tend to
overestimate their competence, while those with high ability tend to
underestimate theirs—when we encounter individuals who are new to a field
we have already mastered. We often see the extent of misery when
inexperienced persons take bold actions, and we frequently can predict where
they fail and when. To boldly invest in a domain unfamiliar to us is therefore
an extreme risk. That’s why the author picked an industry he had worked in
for a while.
Evolving an idea into a thesis is accomplished through iterative steps. We
must gradually refine our thoughts and challenge them until we arrive at a
refined concept. The path to a good thesis can be rocky. We sometimes must
accept that we are on the wrong path and need to start over. This process is
similar to designing a product for a startup: occasionally, you need to pivot,
but eventually, you learn what the market needs. One advantage of an
investor over a founder is that an investor does not have to bring all the
entrepreneurial skills to the table to launch products or services.
When it becomes clear that we can defend our theory about a profitable
business through reasoning and receive feedback, we are on to something; we
can start calling our idea a thesis.
Investment idea: Autonomous driving will pay off
The market for autonomous driving is growing. Numerous statistics support
this assertion: at some point in the future, self-driving vehicles will become
the norm, not the exception. Waymo claims to have already 250,000
driverless Robotaxi rides a week (https://waymo.com/sustainability/).
Various sources predict that this market will grow exponentially worldwide.
Assuming now this market keeps growing, we can foresee the following
impact:
- Fewer individuals will own cars. Instead, people will gradually switch to Robotaxis to get to their destinations.
- For logistics companies, trucks without drivers will expand their reach, as algorithms require no rest, unlike human drivers.
- As the demand for self-driving cars grows, so will the demand for the

---

## Page 119
required hardware, such as sensors.
- A complete transition to autonomous driving will impact infrastructure. With Robotaxis, the demand for parking slots in city centers will be minimized, allowing a considerable amount of space below concrete to be repurposed for other uses.

When people discuss autonomous driving, experts refer to it as level 5—full
automation. Under the term ADAS (Advanced Driver-Assistance System),
we summarize many more technologies in greater detail that will eventually
lead to full automation, such as parking sensors or collision warnings. Each
category in ADAS may be a valuable investment opportunity.
Just as digitalization has created new tech giants that did not exist before, the
field of autonomous driving can provide an environment for new startups to
grow and become significant players. Other companies may lose business due
to the emergence of autonomous driving.
4.1.2 Challenging the idea
Conducting a SWOT analysis of this investment idea enables a more in-depth
examination of its strengths, weaknesses, opportunities, and threats, leading
to a more detailed exploration. We can use LLMs to learn about them or
engage in discussions with domain experts within our network. Many experts
raise ethical questions about self-driving cars. Suppose an autonomous
vehicle cannot prevent an accident. An algorithm must decide whether to
drive into a meadow, where it will hit a person standing there, or hit a wall
that will hurt the person in the car. A lengthy discussion about possible
priorities, which go far beyond this simple example, and about other safety
requirements, such as protection standards against hacking, can slow down or
halt the adoption of self-driving vehicles.
Sub-thesis: Ethics and security may slow down, but not halt
A nation serious about its AI strategy cannot afford to prohibit the
development of self-driving cars due to concerns over ethics and security.
Any country that halts its research while others advance will quickly face a
significant competitive disadvantage.

---

## Page 120
Additional bureaucracy, due to ethical and security concerns, may still deter
some contenders, and autocratic governments might have an advantage in
enforcing innovation compared to democracies. This presents a dilemma for
investors, who must weigh their preference for societies that value human
rights against a nation’s sheer “ability to execute.”
Think like a science fiction author and imagine a world where autonomous
driving is fully adopted. Robotaxis follow a ride-hailing business model
similar to Uber’s. You order, you get in at your origin, leave the car at your
destination, and the car picks up the next passenger. Owning a car will be like
owning a horse today; it will merely be a status symbol. The moment
autonomous driving is proven to be safer, expect insurance companies to
insist on higher premiums if people still choose to drive themselves, which
may accelerate the adoption of autonomous driving.
In such a world, we can envision the vast amount of concrete in parking
spaces being pulverized into dust and replaced with fertile earth, on which
trees and gardens can grow. We can imagine startups creating a business
model by buying cars and leasing them to companies that orchestrate rides,
such as Uber. Of course, we can also consider all the companies that build
hardware for these cars. Let’s group potential growth assets for autonomous
driving.
- Ride-hailing services: Companies that offer ride-hailing services can benefit from cost reduction by replacing drivers with autonomous systems.
- Car manufacturers with a level 5 system: Leaders in the field of autonomous driving may increase sales if clients trust them more than their competitors.
- Truck manufacturers with a level 5 system: Driverless trucks can be operated 24/7 with only brief breaks for loading, unloading, and refueling.
- Appliance providers: Some companies offer complete autonomous driving systems to car manufacturers, but they do not manufacture cars themselves.
- Component providers: Some companies produce components for autonomous driving systems, encompassing both hardware and software

---

## Page 121
at a high level.
We also need to consider countries where companies reside, as they create
the space for them to evolve. Without a doubt, the U.S. is the leader in the
robotaxi field. However, we cannot exclude other countries with a firm bid
on technologies enabling this transition, such as China, Israel, and Germany.
Sub-thesis: Known brands are already valued highly
Known brands working on solutions for robotaxis include Google (Waymo),
Amazon (Zoox), and Tesla. Their capabilities to innovate are already
reflected in their stock prices, so buying these shares means we are not
purchasing undervalued stocks. Although these companies may be excellent
investment opportunities otherwise (Note: the author holds shares of two of
these companies), we decide to focus on smaller, lesser-known companies
that have more substantial growth potential.
One way to move forward is to explore car manufacturers that have not yet
established a strong reputation in their Robotaxi program but are performing
better than is publicly known. However, we need access to recent insider
knowledge of employees working for these companies.
Let’s explore suppliers whose products enable the development of
autonomous cars. A self-driving car relies on a combination of several key
components to operate autonomously. Below is a list of various additional
components an autonomous car needs.
Sensors:
- LiDAR measures distances using laser light to create a 3D map of the environment.
- Radar uses radio waves to detect objects and their speeds, especially in poor visibility conditions.
- Cameras provide visual information about the surroundings for object recognition and lane detection.
- Ultrasonic sensors detect objects close to the vehicle, which are helpful for parking and low-speed maneuvers.

---

## Page 122
Processing unit:
- Car processing units handle data from sensors, run machine learning models, and perform complex calculations to make real-time decisions.
Software:
- Perception algorithms interpret sensor data to recognize objects, pedestrians, and road signs.
- Localization software determines the car’s precise location using GPS and detailed maps.
- Planning and decision-making algorithms determine the best course of action based on current and anticipated traffic situations.
- Control systems manage the vehicle’s speed, steering, and braking based on the planned route.
Connectivity:
- V2X (vehicle-to-everything) communication enables communication with other vehicles, infrastructure, and network services for enhanced situational awareness and coordination.
Mapping:
- High-definition maps provide detailed information about road geometry, traffic signals, and lane markings, which are crucial for accurate navigation.
Power supply:
- Battery and power management ensure all electronic components and sensors are adequately powered.

Researching the potential change in demand for each of these components
requires considerable effort. We need to understand the industry and assess
its specific details. Some industries may depend heavily on raw materials and
be vulnerable to shortages, while others may face a market with a high
number of competitors.

---

## Page 123
If we were to write a book about investing in companies for autonomous
driving, we could dedicate a chapter to each component in the supply chain
and analyze it in detail, including individual SWOT analyses and a thorough
technical study. Comparing serious investing with gambling—picking a
potentially promising company without thorough research—highlights the
significant effort required to make informed decisions. This book aims to
outline a research process. Therefore, we need to narrow our focus and skip
detailed research on every component. Instead, we will illustrate the process
within a specific domain and select LiDAR systems as a likely candidate for
research.
Refined investment idea: LiDAR will rebound
While investing in AI and car manufacturers like Tesla has been booming,
the share prices of companies that provide sensors and other types of
hardware are undervalued. As the LiDAR market is capital-intensive, many
investors may be hesitant, primarily due to the high interest rates of recent
years. However, if the number of Robotaxi drives increases, demand for
hardware will rise, and these companies see a corresponding rise in valuation.
LiDAR may also have applications beyond autonomous driving. The world is
facing significant demographic shifts, and the number of workers is expected
to decline in the upcoming years. LiDAR systems are part of factory
automation, reducing the demand for human workers. This reduction in
worker demand is also highly beneficial in mining, as some areas are
inaccessible to human workers.
We see examples of many stocks that have successfully rebounded after
unfavorable times, and LiDAR would not be the first industry to be
resurrected. If the market for these sensors is down in 2025 and we expect
demand to increase in the upcoming years, we might consider buying low
today and selling high later.
The methodology for identifying concrete assets to invest in becomes more
apparent with each step, and we define what we are looking for more
precisely. However, we are still proceeding. Let’s explore LiDAR further
before selecting our first assets to investigate.

---

## Page 124
4.1.3 Your investment thesis
We have demonstrated how to explore ideas to arrive at a thesis. Given that
autonomous driving is a game-changer, our theory is that the market for
LiDAR systems will rebound.
We can now begin with an in-depth analysis and collect as much information
about the market as possible. You can utilize note-taking apps like Notion
and OneNote to structure your research. Some of us may collect all the notes
in the data science notebooks we use for analysis. Just keep in mind that a
significant amount of research occurs outside of code environments.
We gradually need to pick investment candidates and keep researching them.
With every research, the main questions shall be around the following topics:
- Can the company generate immense cash in the upcoming years, outperforming potential competitors?
- How well can the company protect these profits from copycats (Buffett calls the ability of a company to wall itself from competitors an economic moat)?
- How large is the margin of safety to protect oneself against risks?

Let’s explore this showcase further and examine the LiDAR market.
4.2 LiDAR market
The global LiDAR market was valued at approximately $2 billion to $2.5
billion in 2023. With a CAGR of 20% to 25%—the mean annual growth rate
of an investment over a period longer than one year—it is expected to reach
$6 to $8 billion within 7 years. This growth rate appears promising, but
further exploration is needed to determine whether to invest in this market.
Let’s examine the key information that could influence our decision to invest
in LiDAR.
1. Technology differentiation: LiDAR technologies can be divided into several types, including time of-flight, frequency-modulated continuous wave (FMCW), and solid-state LiDAR...

---

## Page 125
state LiDAR. I spoke with an autonomous driving expert who
highlighted that moving parts in hardware components lead to wear and
tear, which makes them more costly. He therefore sees an advantage in
solid-state LiDAR systems, which are also smaller than other LiDAR
systems.
2. Cost efficiency and scalability: Different vendors offer systems with varying ranges, resolutions, and accuracies. Superior performance often comes at a cost, which is reflected in the total price of the system.
3. Strategic partnerships: Some LiDAR manufacturers have partnered with automotive, robotics, or industrial automation players. New deals with prominent companies, such as Tesla and Ford, as well as tech giants like Google and Amazon, could indicate that LiDAR companies will become increasingly valuable.
4. Regulatory environment and market adoption: The LiDAR market covers autonomous driving, drones, and smart city initiatives...
5. Patent portfolio: Companies with a solid intellectual property portfolio in sensor design, signal processing, or AI integration may have a sustainable competitive advantage...
6. Competition: Smaller companies that innovate faster or disrupt traditional business models may offer higher growth potential...

---

## Page 126
7. Financials and leadership: Strong balance sheets, low debt, and competent leadership, along with a clear roadmap for growth, are essential.

Patience — a success factor
One likely outcome of an investment research sprint is that you end up with
inconclusive results. You may have spoken to many experts, who contradict
each other. You examine the data of specific companies; the numbers are
satisfactory, but more is needed to convince you to invest a reasonable sum.
Investors often also learn that the biggest enemy of the best investment
opportunity is the abundance of good enough opportunities. If you purchase
every asset you get excited about, you might end up with a vast portfolio of
many small to medium-sized holdings. While diversification itself is
beneficial, losing track of what you have invested in and why is not.
Occasionally, the best course of action is to document all the research and
take no further action. Refrain from falling prey to the temptation of quick
riches; instead, staying risk-aware and keeping a clear head are often the
basis for long-term success. As a programmer, you know that you can rerun
algorithms with new and better data at a later stage. So, why rush when you
can proceed with confidence?
4.2.1 Picking candidates
It is time to select our first investment candidates. Although they may not yet
be the companies we invest in, we use them to learn more about what we are
looking for until we can make final decisions. After conducting web research
and reading articles on various platforms, we selected four LiDAR
manufacturers for an initial investigation. A GenAI chat also supported the
results of this initial research.

---

## Page 127
An initial list of investment candidates is finite. We can add new companies
to this list later or remove some as needed. However, we must find a way to
determine which assets are good investments, and we need to start
somewhere. These are the four candidates, listed by stock ticker in brackets.
- Luminar Technologies (LAZR),
- Innoviz Technologies (INVZ),
- Ouster (OUST),
- Aeva Technologies (AEVA).

We are first interested in their market capitalization and earnings
development. The market capitalization code is shown below. We are reusing
the method to collect ratios from earlier chapters.

```python
import yfinance as yf
import pandas as pd

def collect_ratios(tickers: list, ratios: list):
    rows = []
    for ticker in tickers:
        info = yf.Ticker(ticker).info
        row = [ticker] + [info.get(ratio, None) for ratio in ratios]
        rows.append(row)
    return pd.DataFrame(rows, columns=["Ticker"] + ratios)

objects = ["AEVA", "LAZR", "INVZ", "OUST"]
for o in objects:
    ticker = yf.Ticker(o)
    print(f"ticker {o}: {ticker.info['marketCap']}")
```

Examining the results, we obtain the following market capitalization as of
2024, as illustrated below. These numbers also indicate that these companies
still need to become mid-cap stocks, which typically start with a valuation of
$2 billion. The risk associated with a lower valuation is significantly higher,
as the “too big to fail” clause may still be applicable for some companies.
- LAZR: $449,100,640
- OUST: $308,347,328
- AEVA: $175,966,752
- INVZ: $136,608,288

---

## Page 128
Let’s examine these companies’ earnings to see their performance over the
last few years. The code below uses the Alpha Vantage library introduced in
chapter 3 to explore this information.

```python
from alpha_vantage.fundamentaldata import FundamentalData
objects = ["AEVA", "LAZR", "INVZ", "OUST"]
fd = FundamentalData(key=key, output_format='pandas')
for o in objects:
    df_earnings = fd.get_earnings_annual(o)[0].set_index('fiscalDateEnding')
    print(f"ticker {o}: {df_earnings}")
```

We obtain the following results by ticker and reported EPS, which are
transcribed in the table below.
Table 4.1 EPS score of four LiDAR producers
Date AEVA LAZR INVZ OUST
2024-06-30 -1.13 -0.37 -0.31 -1.08
2023-12-31 -0.65 -0.86 -0.85 -7.68
2022-12-31 -0.68 -0.78 -0.94 -0.74
2021-12-31 -0.51 -0.56 -2.34 -0.83
2020-12-31 -0.0185 -2.2127 -1.2487 -8.2332
2019-12-31 0.05 0.0585 -2.4782 -

The numbers suggest that COVID-19 may have impacted industries, as their
EPS scores during the COVID years were lower than in other years.
Nevertheless, the results show a general tendency toward negative earnings.
Some readers, who approach finance conservatively, might object to
investing in companies without profits. Personal finance teaches us that
spending more than earning eventually leads to high debts and misery.
Entrepreneurs, however, understand that personal and corporate finance
sometimes follow different rules. It takes some startups years to become
profitable. When evaluating startups, investors focus on what a startup is
projected to earn. If the outlook is substantial enough, banks and investors
will continue to invest in these companies, even if they are not yet profitable.
4.2.2 Price development

---

## Page 129
Let’s examine how stock prices have developed in recent years, and we will
get the same picture with all four of them. They started somewhere, then
there was hype about the stock, and they all fell. The obvious question,
therefore, is whether they can rebound.
Figure 4.1 Price development of Luminar Technologies (LAZR)
Figure 4.2 Price development of Innoviz Technologies Ltd (INVZ)

---

## Page 130
Figure 4.3 Price development of Ouster (OUST)

---

## Page 131
Figure 4.4 Price development of Aeva Technologies (AEVA)

---

## Page 132
All four companies experienced a decline in share price. At the beginning of
the decade, there was hype surrounding autonomous vehicles. Interestingly,
share prices increased during the COVID-19 pandemic. Driverless cars may
have sounded appealing to many during times of social distancing.
Additionally, it is worth noting that LiDAR is used to automate factory work,
which means a reduced dependency on human labor.
Following the COVID-19 pandemic, the shares declined. This decline can be
attributed to the notion that the market was overhyped and that inflation fears,
arising from the pandemic, particularly impacted a capital-intensive industry
with significant cash burn. Starting in 2022, the Fed increased its interest rate

---

## Page 133
to combat inflation, as shown in Figure 4.5. As it became more expensive to
lend money, investors may have lost interest in capital-intensive LiDAR
stocks.
Figure 4.5 Shows the interest rate at which depository institutions trade federal funds (https://fred.stlouisfed.org/series/DFF)

Table 4.2 Down from the all-time high
Ticker High Low Down
AEVA 100 3,33 96,67%
LAZR 41,80 0,91 97,82%

---

## Page 134
OUST 162,50 6,36 96,09%
INVZ 16 0,79 95,06%

As these four companies are so far below their peak, let’s consider scenarios
in which they get back on track. Let’s explore a scenario that sounds like a
path to riches and will give us the necessary drive to keep researching.
Speculative scenario – LiDAR stocks rebounding
Suppose we invested $40,000 equally among four assets, and let’s suppose all
these stocks return to their former heights. We would receive approximately
3,003 shares of AEVA, 10,989 shares of LAZR, 1,572 shares of OUST, and
12,658 shares of INVZ. Multiplying these by the high value would result in
$1,217,675.75. An investment of $40,000 would make us millionaires.
However, we must also note that if all four companies go bankrupt (which we
do not wish for), we may lose $40,000. Nevertheless, if three go bankrupt and
only one returns to its former glory, we would still make a profit.
We can formulate a speculative hypothesis: Once federal interest rates
decrease, the share prices of capital-intensive LiDAR companies are likely to
rebound. Even if they do not return to their former heights, we can still make
a profit by buying low and selling high.
We must now determine the likelihood of these four companies returning to
their former levels. Investors had already been enthusiastic about the stock,
and those who had invested after the IPO—when the stock went public—
were already heavily disappointed. The question is whether it is even possible
to recoup the initial investment. Let’s examine the debt.
4.2.3 Debt
As LiDAR companies are capital-intensive, debt is a viable option to
consider.
If we call the method collect ratios with the parameters having the signature
`collect_ratios(objects, ["sector", "industry", "debtToEquity"])`,
we obtain the results as transcribed in table 4.3.

---

## Page 135
Table 4.3 Debt-to-equity results for LiDAR companies
Ticker sector industry debtToEquity
AEVA Technology Software - Infrastructure 3.504
LAZR Consumer Cyclical Auto Parts NaN
OUST Consumer Cyclical Auto Parts 26.658
INVZ Technology Electronic Components 39.549

Based on the financial data, AEVA and LAZR might be more troubled than
the others. LAZR has a higher total debt than its market cap. Looking at the
news, we also see that LAZR has announced a workforce reduction.
Additionally, being listed among the most shorted stocks on Wall Street is
not a positive sign. This does not mean that these
companies are on the verge of bankruptcy. According to the SEC filings,
Austin Russell, the founder of Luminar, holds 104.5 million shares, which
comprise approximately 35% of Luminar’s total outstanding shares. This
high ownership could mean significant room for equity investments.
Additionally, according to Crunchbase, the last equity investment in Luminar
was made in December 2022. A viable business with growing potential offers
ample investment opportunities. At the same time, it is also clear that
executives might want to wait before bringing in additional investors if there
is room for the company to increase its valuation on its own.
4.2.4 Management
Many investors look at management to understand the potential. All
companies are led by their founders. Austin Russel is the founder of Luminar.
Co-founder Omer David Keilaf founded Innoviz. Co-founder Soroush
Salehian leads Aeva, and Angus Pacala is the founder of Ouster.
We can continue to monitor the market; a leadership change could be a strong
signal in the market, but we can disregard this aspect for now. If founders

---

## Page 136
leave these companies, it is a warning sign. Investment decisions are often
based on monitoring companies and reacting to events. For instance, if
founders leave, it could be a signal to short-sell the company.
4.2.5 Technology and partnership
We can also explore these companies’ LiDAR systems to determine whether
they offer better or worse performance.
- AEVA: FMCW.
- LAZR: Hybrid Solid-State (with emphasis on long-range 1550 nm lasers).
- INVZ: MEMS-Based Solid-State.
- OUST: Digital Solid-State (VCSEL-based).

LLMs are great research assistants. You can ask them to rank companies and
highlight their value propositions. ChatGPT returned the ranking below in
response to a simple prompt to rank them.
1. Aeva (AEVA) – for its unique FMCW technology and velocity measurement.
2. Luminar (LAZR) – for its long-range, cost-effective LiDAR solution.
3. Innoviz (INVZ) – for solid-state LiDAR and automotive partnerships.
4. Ouster (OUST) – for affordable digital LiDAR and scalability.

All companies have product roadmaps. For instance, Luminar Halo is
designed for mainstream consumer vehicles. Also, all the manufacturers have
partnerships with existing car manufacturers. Luminar is deploying its
LiDAR system in a Volvo car, a brand known for its maximum robustness.
BMW uses Innoviz solid-state LiDAR systems, and AEVA sells its products
to Daimler Trucks. Ouster lists Zoox, the Amazon-owned autonomous
vehicle company, as a client. Ouster might differentiate itself from the others
in the market. They aim for broader adoption of LiDAR, such as in smart
cities.
Experts tend to disagree on the time once we are fully autonomous. The
pessimists still consider decades rather than a few years as realistic. When
discussing full automation, we highlight a scenario in which an autonomous

---

## Page 137
car manages all possible scenarios. Imagine you have been using Robotaxi
rides for years, but then your ride unexpectedly crashes because the system
becomes confused by a specific combination of conditions. Considering all
the details a vehicle might have to manage, it becomes clear that covering the
edge cases is the real challenge.
You encounter scenarios where a car performs one functionality well (for
example, automated parking), but needs time to master other cases (driving in
historically grown cities with all their narrow alleys and facing human drivers
who do not always follow rules). The term operational design domain
addresses this by placing automation within a specific context. Waymo does
not build cars for the consumer market. They provide taxi services in the city
and do not sell vehicles to individuals, as the car ownership business model is
becoming obsolete. Eyeing another use case, the German Autobahn does not
have speed limits. Traveling at 200 mph or more from Berlin to Munich in an
autonomous vehicle is one use case that residents of Germany would love to
have. A use case that supports cars at this speed is uninteresting for the U.S.
market without regulatory changes in maximum speed limits. Therefore,
companies targeting the German market may prioritize their capabilities to be
fast and autonomous, while others focus on excelling in other areas, such as
city driving.
Another consideration is limitations and poor capabilities. Lousy driving
conditions, such as fog, can hinder even the best drivers. However, most
sensors are superior to the human eye, and autonomous cars are less limited
by visual conditions.
You spend significant research time exploring companies in complex
technical domains. To be effective, you must structure and continuously
deepen your knowledge base. In technology, seemingly minor features—
often overlooked without domain-specific expertise—can be game changers.
You don’t need to master every technical detail, but you must understand
how components interact, know which questions to ask, and to whom.”
4.2.6 Projected earnings
Let’s examine the projected earnings for the four companies on the market.

---

## Page 138
Their earnings per share and projected revenue growth, as of November
2024, are listed in table 4.4, based on data from the investment platform
Seeking Alpha.
Table 4.4 Projected earnings, all prices in millions
Ticker Dec 2024 Dec 2027 Growth
AEVA 6.63 32 (in 2026) 382.65%
INVZ 24.30 670 2660.49%
LAZR 70.28 851 1110.8%
OUST 111.00 311.80 180.9%

Examining these projections, it would be irrational not to invest if they could
be guaranteed. Several details in the projections above require validation.
LAZR is expected to grow revenues by over ten times in three years; this
sounds ambitious. Let’s see if we can gather different data from other
sources.
We can explore whether we get similar data from Python using financial
libraries. We can run this code, which fetches and interprets earnings
estimates from Yahoo Finance.

```python
objects = ["AEVA", "LAZR", "INVZ", "OUST"]
for o in objects:
    stock = yf.Ticker(o)
    print(f"{o}: {stock.earnings_estimate}")
```

The results of this query yield different outcomes. Table 4.5 displays the
transcribed earnings estimates of Luminar, with the timespan on the left and
expected average, low, and high results. The column “yearsAgoEps” refers to
the value in the last epoch. Examining the first row, “yearsAgoEps” of -3
corresponds to the result of the quarter preceding it.
Table 4.5 Earnings estimates of Luminar Technologies
period avg low high yearsAgoEps NrOfAnalysts growth
0q -1.99971 -2.25 -1.71885 -3 4 0.3334
+1q -1.82250 -2.10 -1.50000 -2.85 4 0.3605

---

## Page 139
0y -9.94375 -10.20 -9.62 -13.05 4 0.2380
+1y -6.53799 -7.60 -5.85 -9.94 4 0.3425

This data indicates that Luminar is still expected to post no profits. On the
positive side, losses are expected to narrow significantly compared to prior
periods. From last year’s EPS of -13.05, we expect an EPS of -9.94 for that
year, representing a 24% improvement. The company is improving and
burning less cash. If the trend does not change, it is a matter of time before a
profit is achieved. However, as there is no profit yet in sight, risk is involved.
Earnings of startups may be the most difficult items to project. To forecast
the future, we often need to rely on past data. Ouster was founded in 2015,
Luminar in 2012, and Innoviz and Aeva in 2016. We can assume that these
companies were waiting for autonomous driving to become mainstream so
they could monetize the idea that, at some point, every car in the world would
need “eyes.” Using the number of past earnings for these companies may not
be a reliable source. One of the companies might land a big deal that
suddenly becomes a game-changer.
This may be the time to stop and wait for market signals: a large contract
with a major player, some information that the project is progressing well, or
that the car is exceeding expectations.
Analyzing other fields
The purpose of this chapter is to outline the process of identifying growth
companies. This research process often becomes far more extensive and
iterative, with cycles of building up theses, learning from new events or
insights, and refining knowledge to adjust the investment strategy.
Select the domains you are familiar with. If you are knowledgeable in
biotech, research companies working on mRNA vaccines. If you are skeptical
about this approach, consider weight loss drugs as a strong alternative to
explore. Continue researching until you find the equivalent of a startup’s
unfair advantage (https://digitalleadership.com/blog/unfair-advantage/).
4.3 Risks

---

## Page 140
Suppose we become obsessed with making millions by buying shares of
undervalued LiDAR companies and selling them at high prices. We might
lose objectivity—too many individuals who sank into dreams ended up in
nightmares.
Exploring risks may be even more important than analyzing potential
benefits. If you miss a good investment opportunity, it might hurt your pride,
but losing money can be even more devastating, especially if you later
discover that a loss could have been prevented with better risk management.
Hedge funds often split the roles of analysts between those who research
risks and returns. This creates checks and balances to prevent overly
optimistic investments.
If we invest alone, we can switch viewpoints. One day, you let yourself get
excited and explore all the good things that can happen. Another day, you
switch roles and analyze the opportunity from a pessimist’s perspective.
Seeing this opportunity from multiple angles will increase your chances of
making the right decisions.
Let’s imagine we are approached by an overly excited investor who claims
that “LiDAR stocks will rebound once the federal interest rates go down.”
Our job is now to explore reasons why this optimist might be wrong and what
we need to analyze to reduce uncertainties.
4.3.1 Falling into obsolescence
Tesla Vision is a program that explores an autonomous driving future in
which better computer vision algorithms replace LiDAR sensors. Many
experts debate whether Elon Musk’s bet on a future without LiDAR systems
is a good move. Many believe that level 5 autonomous driving without laser
sensors that measure the distance to objects is impossible. However, what if
Tesla’s strategy pays off?
LiDAR systems are costly components. If automakers can achieve a good
enough level of performance without these sensors, they’ll likely eliminate
them to make cars more affordable for their customers.

---

## Page 141
In the worst-case scenario, LiDAR companies focusing mainly on the
automotive market could lose their very existence. Before investing seriously
in LiDAR, a deeper understanding of LiDAR alternatives is helpful.
4.3.2 Squashed by industry giants
Waymo’s business model is to offer robotaxi rides to consumers. They do not
manufacture cars on their own. Let’s consider a scenario in which Waymo
management decides to sell appliances to other car manufacturers, enabling
them to reach level 5 automation. Competing with Alphabet, which offers a
comprehensive platform as one of the pioneering companies in the field of
autonomous driving, might be challenging. The bad news for those interested
in investing in LiDAR startups is that Waymo builds its own hardware.
The four companies we investigated are startups that try to gain a larger
market share with their hardware. Many existing larger corporations have
been providing LiDAR systems to their automotive clients for years. One
example is Valeo, a company headquartered in France. Suppose you are a car
manufacturer who is deciding on new LiDAR systems for an upcoming
model. You have tested the hardware of various suppliers. Let’s assume the
hardware of a new startup and a large supplier you have been working with
for many years scored equally. Would you pick the smaller supplier, whom
you do not know well yet, and take on more risk due to their small size?
4.3.3 Globalization and conflicts
Innoviz Technologies is headquartered in Israel. At the time of writing this
chapter, Israel is involved in ongoing conflicts. Forecasting how existing
conflicts evolve is beyond the scope of this book; however, we must
acknowledge that companies headquartered in a country facing conflict are at
risk.
We have also seen trade wars between the U.S. and China. The USA has
already banned Huawei, so why couldn’t the American government
investigate banning Chinese LiDAR companies from the U.S. market? Hesai
Group, the leading Chinese manufacturer, might face challenges in the U.S.
market. Looking at recent news, they had already been blacklisted at the

---

## Page 142
Pentagon, which was reversed after the company sued
(https://www.ft.com/content/97dff7c2-33e9-4729-a059-968e308cac49).
In the late 1990s and early 2000s, Germany’s companies were among the
leading producers of solar panels. More than 20 years later, China is
responsible for over 80% of the world’s photovoltaics manufacturing
capacity across the supply chain. Some experts argue that China’s economic
model of state intervention can give Chinese companies an unfair advantage.
To understand this risk better, we would have to explore scenarios in which
state-controlled interventions affect the market and assess their likelihood.
4.4 Ongoing analysis
We can compare looking for investment opportunities to a hunter waiting for
their prey. If they strike too soon or too late, they miss the target. Finding the
right moment is also crucial when hunting for investments.
Like a real hunter, an investor also has limited shots. If you lock in your
money too early in investment opportunities, you may lack the capital when a
better opportunity arises. Therefore, an investment analysis might lead to a
“let’s wait and see!” approach, keeping an eye out for a more favorable
opportunity. In this section, we explore how to maintain continuous market
screening.
4.4.1 Media
Investment platforms provide articles by analysts, such as this one
(https://seekingalpha.com/article/4738211-lidar-quarterly-insights-q3-2024-summary). An investor can subscribe to newsletters to understand what other
investors think. Additionally, platforms like Reddit often feature subreddits
dedicated to specific stocks, and you can follow companies on social media.
High-quality content comes from reputable newspapers, such as The Wall
Street Journal, The Financial Times, or Bloomberg. For domains such as
LiDAR systems, there are notable magazines for experts who delve into the
details about the technology.

---

## Page 143
One key challenge is to extract truthful content. LLMs might hallucinate, and
content from a company’s social media or investor relations department may
not always be objective. A specific event for every public company is the
earnings report assembly. No executive will ever say something like, “This
quarter was horrible; we completely failed in everything we set out to do.”
Instead, the art is to read between the lines. Sometimes, analysts need a solid
domain understanding to interpret a CEO’s words correctly.
4.4.2 Trend analysis
Trends can be foreseen by analyzing Google searches or hashtags on social
media. Examining the LiDAR searches below in figure 4.6, we observe that
this topic has become increasingly popular over time.
Figure 4.6 LiDAR in Google Trends.

---

## Page 144
Let’s also explore the four companies we chose and examine how often they
are searched on Google. We can experiment by adjusting stock tickers and
changing names. After all, “ouster” also has a different meaning in English,
and using the stock ticker OUST does not help. Figure 4.7 shows the results
of a Google Trends investigation for the company names in 2024.

---

## Page 145
Figure 4.7 Google Trends on OUST, LAZR, AEVA, INVZ
We can also use Python code to collect information on trends. One library to
accomplish this step is pytrends. Let’s examine the code below, which
collects historical trend data from Google.

---

## Page 146
```python
from pytrends.request import TrendReq
import pandas as pd

pytrend = TrendReq(hl='en-US', tz=360)
keywords = ["Luminar Technologies", "Ouster Inc", "AEVA Technologies", "Innoviz Technologies"]
pytrend.build_payload(keywords, cat=0, timeframe='today 12-m', geo='', gprop='')
interest_over_time_df = pytrend.interest_over_time()
print(interest_over_time_df.head())
interest_over_time_df.to_csv('google_trends_data.csv')
```

Table 4.6 Trends in Google search for LiDAR companies
Date Luminar Ouster AEVA Innoviz isPartial
2024-10-13 33 5 3 3 True
2024-10-06 43 5 4 3 False
2024-09-29 42 2 2 2 False
2024-09-22 48 0 0 0 False
2024-09-15 39 0 0 0 False

Trends indicate how often users search for a keyword, but we need to
conduct a news sentiment analysis to examine the sentiments.
4.4.3 News sentiment analysis
We can collect news and comments from any form of media and analyze
them with algorithms. The library Alpha Vantage, introduced in chapter 3,
provides methods to collect reaggregated data. Let’s use the code below to
examine the news sentiment score.

```python
def collect_sentiments(ticker):
    import requests
    r = requests.get(f'https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers={ticker}&apikey={key}')
    return pd.DataFrame.from_dict(r.json()['feed'])

def summarize_sentiments(df, ticker):
    from collections import Counter
    ticker_sentiment = df['ticker_sentiment']
    label_string = ""
    score = 0
    for record in ticker_sentiment:
        if record[0]['ticker'] == ticker:
            if label_string != "":
                label_string += ","
            label_string += record[0]['ticker_sentiment_label']
            score += float(record[0]['ticker_sentiment_score'])
    print(score)
    word_count = Counter(label_string.split(","))
    word_count_df = pd.DataFrame(word_count.items(), columns=['Word', 'Count'])
    print(word_count_df)
```

---

## Page 147
Table 4.7 Sentiment score of selected LiDAR companies
Ticker Score BU SW BU NEU SW BE BE
INVZ 1.197801 0 6 16 1 0
OUST 6.714778 10 10 4 0 0
LAZR 4.497577 5 9 11 1 0
AEVA 1.623819 1 5 22 1 0

The news tends to be positive. We still want to be cautious. What if most of
the sources are from investors who plan to invest? Therefore, it is helpful to
continue analyzing trends and exploring shifts when they occur, and also to
check the sources carefully.
4.4.4 Measuring success

---

## Page 148
Whatever thesis you follow, always ask yourself how to measure success.
Some breakthroughs are not immediately visible in revenues or profits. The
best sources are often insiders, such as company employees. Experts working
on crucial projects are commonly prohibited from disclosing their insights
publicly.
In the reference example of autonomous driving, we can count the number of
Robotaxis on the street and monitor the media for upcoming deals and
contracts. One way to assess whether you have done proper work in creating
your investment thesis is to evaluate how easily you can find the metrics to
measure its success. If you are unsure what to look for, you should take more
time to refine your thesis.
4.5 What is next
Many analysts who carefully read our LiDAR study may agree that there are
still many details that require further research before a decision can be made.
This exploration of LiDAR can be concluded in a “wait and see” scenario.
Some bolder investors might choose to invest. One detail that every investor
needs to decide for themselves is how much time they want to spend on
analysis before making a decision. Even though LLMs can speed up the
research process, thorough analysis may still take time.
We have outlined many risks. One day, we might discover that Tesla Vision
is on the right track and that the market for LiDAR in the automotive sector is
being disrupted. However, we could also find that Tesla’s approach without
LiDAR is failing. Other market signals can influence the future of LiDAR
stocks. While investigating startups, we found that one of them is likely to be
acquired by a larger company, which would probably boost share prices.
The definition of an ideal company to invest in is one that is poised to
generate substantial cash flow for several years while maintaining a strong
economic moat. Based on the existing analysis, we have identified candidates
with a promising future. However, we must acknowledge that there is still
considerable uncertainty. The decision-making process depends significantly
on the individual investor's strategy.

---

## Page 149
- Some bold investors might see enough evidence to invest money.
- Cautious investors may spend more time researching the company. Some may conclude that the risks are not worth the potential gains and pick more conservative choices.
- Some investors may also employ a mixed strategy. They start investing a small amount and keep researching.

Some speculative ideas to explore
- With the COVID-19 pandemic, we have witnessed a significant advancement in mRNA technology...
- Climate change is having an increasingly significant impact on the world. Renewable energy or carbon sequestration.
- Obesity weight loss drugs as a strong alternative.
- Vegan products that taste as good as meat.
- Geopolitical challenges & energy for AI data centers.

4.6 Summary
- Gambling is often guided by instinct; investing by critical thinking.
- Stick to what you know and invest in businesses that you understand.
- An investment thesis highlights why you believe an investment will be profitable.
- Peer reviews are invaluable for refining a thesis.
- Explore innovations like autonomous driving to stay ahead of the market.
- Consider potential risks such as obsolescence or ethics.
- Look for undervalued niche players with unseen value.
- Re-assess startups that may take years to produce profits.

---

## Page 152
5 Income portfolios
This chapter covers
- Strategies to create passive income
- How to find stocks that pay solid dividends
- When to choose bonds over stocks for income portfolios
- Using cryptocurrency staking to generate passive income

---

## Page 153
5.1 Dividends
A dividend is a portion of a company’s profit that is paid to its shareholders.
BCG Matrix: Cash Cows represent stable, mature businesses with minimal reinvestment needs, ideal for dividend payouts.
Figure 5.1 BCG Matrix

---

## Page 155
Economic Moats:
1. Proprietary information (Coca-Cola secret formula)
2. Brand loyalty (Apple iPhone)
3. Innovation (Tesla EV tech)
4. Scale (Amazon economies of scale)
5. Network effect (Meta/Facebook)
6. Locked-up supply (De Beers diamonds)
7. Intellectual property (Pfizer drug patents)
8. Regional oligopolies (Utilities)

---

## Page 158
Parameters for dividend investments:
- Annual payout, frequency, dividend yield, dividend growth years, dividend growth rate (CAGR), payout ratio, residency/taxation.

```python
# Listing 5.1 Calculating dividend growth rate
def calculate_dividend_growth_rate(stock):
    try:
        dividends = stock.dividends
        if dividends.empty:
            return None, None
        dividends_by_year = dividends.resample('YE').sum()
        if len(dividends_by_year) > 1:
            first_year = dividends_by_year.index[0].year
            last_year = dividends_by_year.index[-1].year
            first_dividend = dividends_by_year.iloc[0]
            last_dividend = dividends_by_year.iloc[-1]
            num_years = last_year - first_year
            cagr = ((last_dividend / first_dividend) ** (1 / num_years)) - 1 if num_years > 0 else None
        else:
            cagr = None
        payouts_per_year = dividends.resample('YE').count().mean()
        if payouts_per_year > 3.5:
            payout_frequency = "Quarterly"
        elif payouts_per_year > 1.5:
            payout_frequency = "Semi-Annual"
        elif payouts_per_year > 0.5:
            payout_frequency = "Annual"
        else:
            payout_frequency = "Irregular"
        return cagr, payout_frequency
    except Exception as e:
        print(f"Error processing {stock}: {e}")
        return None, None
```

---

## Page 165
5.2 Bonds
Attributes of a Bond (Indenture):
- Borrower, Maturation date, Coupon payments, Risk rating, Payment modalities.

Table 5.1 Rating of bonds
Moody's S&P Fitch Meaning
Aaa AAA AAA Prime credit quality, lowest risk
Aa1-Aa3 AA+-AA- AA+-AA- Very high credit quality
A1-A3 A+-A- A+-A- Upper medium grade, strong capacity
Baa1-Baa3 BBB+-BBB- BBB+-BBB- Lower medium grade, adequate
Ba1-Ba3 BB+-BB- BB+-BB- Speculative grade, higher risk
B1-B3 B+-B- B+-B- Highly speculative, material default risk
Caa1-Caa3 CCC+-CCC- CCC+-CCC- Substantial risk
Ca CC, C CC, C Near default, highly vulnerable
C D RD, D In default

---

## Page 171
5.3 Crypto staking
Proof-of-Work (PoW) vs Proof-of-Stake (PoS). Self-custody cold wallets vs exchange custody ("Not your keys, not your coins").

Average Staking Rewards (APY) sample:
- Ethereum (ETH): 4% – 6%
- Cardano (ADA): 4% – 6%
- Solana (SOL): 6% – 8%
- Polkadot (DOT): ~14%
- Avalanche (AVAX): 8% – 12%

---

## Page 179
6 Building an asset monitor
Key architecture: Gathering data from Alpaca REST API, Interactive Brokers (`ib_insync`), and offline SQLite assets table (`offline_asset`), merging into a single normalized DataFrame, converting currency via `CurrencyConverter`, exporting to Google Sheets using `gspread` and live formulas (`=GOOGLEFINANCE()`).

---

## Page 205
7 Risk management
7.1 Ukemi (Safeguard first, then scale)
Stop-Loss Orders: Static stop loss and trailing stop loss.

7.1.3 Risk measurement
- Market Risk, Sector Risk, Asset-specific Risk.
- Value at Risk (VaR): Monte Carlo simulation vs Variance-covariance method.

```python
# Listing 7.1 Monte Carlo simulation for VaR on Apple
import numpy as np
import yfinance as yf
import matplotlib.pyplot as plt

ticker = "AAPL"
confidence_level = 0.95
num_simulations = 10000
time_horizon = 1

stock = yf.Ticker(ticker)
hist = stock.history(period="1y")
returns = hist['Close'].pct_change().dropna()

mu = returns.mean()
sigma = returns.std()
last_price = hist['Close'].iloc[-1]

simulated_returns = np.random.normal(mu, sigma, num_simulations)
simulated_prices = last_price * (1 + simulated_returns)
var_threshold = np.percentile(simulated_prices - last_price, (1 - confidence_level) * 100)

print(f"{confidence_level * 100}% Monte Carlo VaR for {ticker}: ${-var_threshold:.2f}")
```

7.6 Portfolio Optimization & Markowitz Efficient Frontier
Sharpe Ratio: $SR = (R_p - R_f) / \sigma_p$
Shiller P/E (CAPE Ratio): 10-year inflation-adjusted price-to-earnings smoothing.

---

## Page 261
8 AI for financial research
Discriminative ML (Supervised regression/classification, Unsupervised K-Means clustering) vs Generative AI (LLMs: GPT-4o, Gemini 1.5 Pro, Claude 3 Opus, Mistral, AdaptLLM/finance-chat).

K-Means Clustering on Returns & Volatility:
Optimal $k$ selection via Elbow Curve analysis (`distortions.append(k_means.inertia_)`).

Random Forest Regressor stock price forecasting:
Using `sklearn.ensemble.RandomForestRegressor` with `target = Close.shift(-1)`.

---

## Page 312
9 AI agents
DeepLearning.ai Agentic Patterns:
1. Reflection
2. Tool Use
3. Planning
4. Multi-Agent Collaboration

RAG & StateGraph Workflow:
Trigger (Scheduled / Query / Alert) $\rightarrow$ Retrieval (RAG Vector DB, Web Search, MCPs) $\rightarrow$ Generation (Multi-LLM) $\rightarrow$ Peer Review $\rightarrow$ Notion / DB output.

LangGraph StateGraph implementation for RAG:
`graph_builder = StateGraph(State).add_sequence([retrieve, generate])`

---

## Page 343
10 Charts and technical analysis
Chart Patterns: Bearish/Bullish Double Top, Double Bottom, Flags, Head & Shoulders, Support & Resistance lines.

Technical Indicators & Formulas:
- SMA, EMA, WMA, HMA (Hull Moving Average).
- Moving Average Ribbons (10, 20, 30, 40, 50, 60 day SMAs).
- Bollinger Bands: Middle ($SMA_{20}$), Upper ($SMA + 2\sigma$), Lower ($SMA - 2\sigma$).
- MACD: $EMA_{12} - EMA_{26}$, Signal = $EMA_9(MACD)$, Histogram = $MACD - Signal$.
- Ichimoku Cloud: Conversion (Tenkan 9d), Base (Kijun 26d), Span A, Span B (52d), Lagging Span (Chikou 26d).
- Streamlit dashboards (`st.line_chart`, `mpf.plot(..., returnfig=True)`).

---

## Page 399
11 Algorithmic trading
Backtesting SMA Crossover strategies on historical data.

Order Execution:
- Order Types: Market, Limit, Stop, Stop-limit, Trailing stop.
- Modalities: FOK (Fill or Kill), GTC (Good 'til Canceled).
- Broker APIs: Interactive Brokers (`ib_insync`), Alpaca (`py-alpaca`).

---

## Page 434
12 Private equity: Investing in startups
Funding Lifecycle: Pre-Seed $\rightarrow$ Seed $\rightarrow$ Series A $\rightarrow$ Series B $\rightarrow$ Series C $\rightarrow$ Exit (IPO / M&A Acquisition / Fire Sale / Shutdown).

Investment Vehicles:
- Venture Capital (VC): 2% Management Fee, 20% Carry Fee, LPs.
- Angel Syndicates: Lead Investor, Special Purpose Vehicle (SPV), Pro-rata fee.
- Sovereign Wealth Funds (SWFs).

Startup Valuation: Discounted Cash Flow (DCF) with high discount rates (20%-50%).

Dilution Modeling:
```python
# Listing 12.2 Calculating dilution
import pandas as pd
total_shares = 1_000_000
founder_shares = 500_000
funding_rounds = [
    ("Seed", 500_000, 25),
    ("Series A", 2_000_000, 20),
    ("Series B", 10_000_000, 15),
    ("Series C", 50_000_000, 10)
]
dilution_data = []
for round_name, investment, equity_given in funding_rounds:
    new_shares = total_shares * (equity_given / (100 - equity_given))
    total_shares += new_shares
    founder_ownership = (founder_shares / total_shares) * 100
    dilution_data.append([round_name, investment, int(total_shares), round(founder_ownership, 2)])
df = pd.DataFrame(dilution_data, columns=["Round", "Investment ($)", "Total Shares", "Founder Ownership (%)"])
```

---

## Page 466
13 The road goes ever on and on
- Dunning-Kruger Effect awareness.
- Shiller 80/20 Rule: 80% broad index funds, 20% active stock selection.
- Investment Diary & Retrospectives for emotional discipline.
- Gandalf Principle: "All we have to decide is what to do with the time that is given to us."
