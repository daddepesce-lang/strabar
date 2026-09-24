import SeoLanding from '@/components/SeoLanding';
import { landingJsonLd } from '@/lib/seo';

// Figures in the "how long" section come from the app's model (src/lib/bac.js):
// 1L Maß at 6%, drunk in ~1h, one every 90 min. Orders of magnitude, not promises.
const FAQ = [
  { q: 'When is Oktoberfest 2026?', a: 'Oktoberfest 2026 in Munich runs from 19 September to 4 October 2026 on the Theresienwiese (the “Wiesn”). The middle weekend, 26-27 September, is traditionally the busiest for visitors from Italy.' },
  { q: 'How much beer is in a Maß, and how much alcohol?', a: 'A Maß is a 1-litre stein. The Festbier served in the tents is usually 5.8-6.4% ABV, so one Maß holds roughly 47-50 g of pure alcohol — about four 330 ml beers or 4-5 glasses of wine.' },
  { q: 'How many Maß before I can drive?', a: 'It depends on weight, sex, food and pace. For a 70-80 kg man even a single Maß can push BAC above 0.5 g/L; after two, it usually takes 6-8 hours from the last sip to get back under the limit, and after three it’s over 10 hours — i.e. the next morning. For a 60 kg woman a single Maß takes around 6 hours. Strabar estimates for your profile the time you’ll be back under 0.5, but it is only an estimate: if you have to drive, don’t drink.' },
  { q: 'What is the drink-driving limit in Germany?', a: 'Germany’s general limit is 0.5 g/L (0.5‰), the same as Austria and Italy. Novice drivers on probation and anyone under 21 have a zero limit. From 0.3‰ with signs of impaired driving, criminal penalties can apply. Rules change: always check the current regulations.' },
  { q: 'What is a Radler Maß?', a: 'A “cut” Maß: half beer, half lemonade, about 2.5% ABV. It’s how locals last in the tent until the evening without overdoing it. In Strabar you’ll find it in the Festbier / Maß picker.' },
  { q: 'How do I get the Wiesn 2026 badge?', a: 'Log any session on Strabar between 19 September and 4 October 2026, wherever you are and whatever you drink. The 🥨 Wiesn 2026 badge appears in your Profile, under Badges. After 4 October it can no longer be earned.' },
  { q: 'Is Strabar free?', a: 'Yes: logging your Maß, seeing your estimated BAC live and the time you’re back under 0.5, getting an alert when you go over the limit and sharing your night as a story are all free.' },
];

export const metadata = {
  title: 'Oktoberfest 2026: Maß, BAC & when you can drive again | Strabar',
  description: 'Oktoberfest 2026 (19 September – 4 October): how much alcohol is in a Maß, how long until you’re back under 0.5, and how to estimate it for your profile with Strabar.',
  keywords: 'oktoberfest 2026, oktoberfest dates 2026, oktoberfest maß, alcohol in a maß, oktoberfest bac calculator, how long after beer can i drive, germany drink driving limit, radler maß, wiesn 2026',
  alternates: {
    canonical: '/en/oktoberfest',
    languages: { 'it-IT': '/oktoberfest', en: '/en/oktoberfest', 'x-default': '/oktoberfest' },
  },
  openGraph: {
    title: 'Oktoberfest 2026: drink your Maß, Strabar tells you when you can drive',
    description: 'Log your Maß, watch your estimated BAC and see what time you’re back under 0.5.',
    url: '/en/oktoberfest',
    type: 'article',
    locale: 'en_US',
  },
};

export default function OktoberfestEnPage() {
  return (
    <SeoLanding
      eyebrow="Oktoberfest 2026 · Wiesn"
      h1="Drink your Maß. Strabar tells you when you can drive again."
      lead="From 19 September to 4 October Munich is the world’s beer capital. One Maß is four beers: log the ones you drink, watch your estimated BAC live and know what time you’re back under 0.5 before getting behind the wheel."
      ctas={[
        { label: '🥨 Get the Wiesn badge', href: '/log', primary: true },
        { label: 'Get the app', href: '/install' },
      ]}
      sections={[
        {
          id: 'badge',
          h2: '🥨 How to get the Wiesn 2026 badge',
          paragraphs: [
            'The seasonal Wiesn 2026 badge unlocks with a single session logged on Strabar by Sunday 4 October. You don’t need to be in Munich or drink beer: any session counts, wherever you are.',
          ],
          list: [
            { t: '1. Tap “Log a drink”', d: 'the red button at the top (on mobile, in the middle of the bottom bar).' },
            { t: '2. Start a session', d: 'pick the venue or log without location, then add what you drink: the “Festbier / Maß” picker includes the 1-litre Maß.' },
            { t: '3. Find it in your Profile', d: '🥨 Wiesn 2026 shows up in the Badges section. After 4 October it can no longer be earned.' },
          ],
        },
        {
          id: 'dates',
          h2: 'Oktoberfest 2026 dates',
          paragraphs: [
            'Oktoberfest 2026 opens on Saturday 19 September with the traditional “O’zapft is!” and closes on Sunday 4 October, on Munich’s Theresienwiese. Many visitors drive in by car or camper van and head home the next day — and that’s when counting your Maß stops being a game: last night’s BAC can still be over the limit in the morning.',
          ],
        },
        {
          id: 'mass',
          h2: 'How much alcohol is in a Maß',
          list: [
            { t: '1 Maß = 1 litre', d: 'of Festbier, the special Wiesn brew, stronger than a regular lager (5.8-6.4%).' },
            { t: '≈ 48 g of pure alcohol', d: 'about four 330 ml beers, or 4-5 glasses of wine.' },
            { t: 'Radler Maß', d: 'half beer, half lemonade, around 2.5%: less than half the alcohol per litre.' },
            { t: 'Halbe', d: 'half a litre, where available: a simple way to slow the pace.' },
          ],
        },
        {
          id: 'drive',
          h2: 'How long until you’re back under 0.5?',
          paragraphs: [
            'Rough estimates from the same model the app uses, for a 6% Maß drunk over about an hour, one every 90 minutes. Time is counted from the end of the last Maß.',
          ],
          list: [
            { t: 'Man 70-80 kg, 1 Maß', d: 'peak 0.7-0.9 g/L: already over the limit. Under 0.5 after about 2 hours.' },
            { t: 'Man 70-80 kg, 2 Maß', d: 'peak 1.4-1.7 g/L. Under 0.5 after 6-8 hours.' },
            { t: 'Man 70-80 kg, 3 Maß', d: 'peak above 2 g/L. Over 10 hours: no driving the next morning.' },
            { t: 'Woman 60 kg, 1 Maß', d: 'peak around 1.3 g/L. Under 0.5 after about 6 hours.' },
            { t: 'Woman 60 kg, 2 Maß', d: 'peak above 2.5 g/L. Over 10 hours.' },
          ],
        },
        {
          id: 'limits',
          h2: 'Drink-driving limits in Germany, Austria and Italy',
          paragraphs: [
            'The general limit is 0.5 g/L in all three countries. Novice drivers and under-21s have a zero limit in Germany. From 0.3‰ with signs of impaired driving you can face criminal charges.',
            'Strabar is not a breathalyser and doesn’t replace a test: it gives you an estimate based on weight, sex, food and drink times. It helps you make an informed decision, not push the limit. If you have to drive, the best rule is still not to drink.',
          ],
        },
        {
          id: 'with-strabar',
          h2: 'Using Strabar at the Wiesn',
          paragraphs: [
            'Start a session when you walk into the tent and add each Maß with one tap from the “Festbier / Maß” picker. Strabar updates your estimated BAC live, shows what time you’ll be back under 0.5 and notifies you when you go over the limit — even with the app closed.',
            'At the end of the night, share your “Wiesn 2026” story: your Maß count and the estimated time you’re back under 0.5. You’ll also unlock the seasonal Wiesn 2026 badge 🥨, available only until 4 October.',
          ],
        },
      ]}
      stepsTitle="The Wiesn in 4 steps"
      steps={[
        { title: 'Start a session', desc: 'Once in the tent, go live: your friends can follow along.' },
        { title: 'Add your Maß', desc: 'Festbier 0.5L, Maß 1L or Radler Maß: one tap and it’s counted.' },
        { title: 'Watch your BAC', desc: 'The estimate updates live, with the time you’re back under 0.5.' },
        { title: 'Share and head home', desc: 'Post your Wiesn 2026 story and know from what time you could drive again.' },
      ]}
      faq={FAQ}
      faqTitle="Oktoberfest FAQ"
      finalCta={{
        title: 'O’zapft is! 🍻',
        sub: 'Log your Maß, keep an eye on your BAC and head home at the right time. Free.',
        button: { label: '🍺 Start your Wiesn on Strabar', href: '/' },
      }}
      relatedTitle="Keep exploring"
      related={[
        { label: 'Oktoberfest (Italiano)', href: '/oktoberfest' },
        { label: 'Plan a pub crawl', href: '/en/pub-crawl' },
        { label: 'Venice bacaro tour', href: '/en/bacaro-tour' },
        { label: 'Get the app', href: '/install' },
      ]}
      jsonLd={landingJsonLd({
        path: '/en/oktoberfest',
        name: 'Oktoberfest 2026: Maß, BAC & when you can drive again',
        description: 'Oktoberfest 2026 guide: dates, alcohol in a Maß, hours to get back under 0.5 g/L and drink-driving limits in Germany, Austria and Italy.',
        lang: 'en',
        faq: FAQ,
      })}
    />
  );
}
