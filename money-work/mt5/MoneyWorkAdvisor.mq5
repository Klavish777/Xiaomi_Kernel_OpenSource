#property strict
#property version   "1.00"
#property description "Money Work AUDCAD MT5 Expert Advisor. Demo-first; risk caps are hard-coded."

#include <Trade/Trade.mqh>

// This EA uses MT5 OHLC history (never chart pixels or synthetic data) and the
// same EMA20/EMA50 + 14-change RSI direction rule used by Money Work. It also
// gates new entries on a recent Frankfurter AUD/CAD reference and the EA's own
// closed-trade history. It is not a profit guarantee.

input string          InpSymbolPrefix             = "AUDCAD";
input ENUM_TIMEFRAMES InpTimeframe                = PERIOD_M5;
input int             InpHistoryBars              = 2000;
input bool            InpArmTrading               = false;
input bool            InpAllowLiveTrading         = false;
input string          InpLiveConfirmation         = "";
input bool            InpTesterAllowReferenceBypass = false;
input long            InpMagic                    = 26092709;
input int             InpStartHour                = 9;
input int             InpStartMinute              = 0;
input int             InpEndHour                  = 17;
input int             InpEndMinute                = 0;
input bool            InpTradeSunday              = false;
input bool            InpTradeMonday              = true;
input bool            InpTradeTuesday             = true;
input bool            InpTradeWednesday           = true;
input bool            InpTradeThursday            = true;
input bool            InpTradeFriday              = true;
input bool            InpTradeSaturday            = false;
input string          InpReferenceUrl             = "https://api.frankfurter.dev/v1/latest?base=AUD&symbols=CAD";

#define REFERENCE_REFRESH_SECONDS 21600
#define REFERENCE_MAX_AGE_SECONDS 86400
#define MINIMUM_HISTORY_BARS 50
#define HARD_MAX_LOTS 0.01
#define HARD_STOP_LOSS_PIPS 20.0
#define HARD_TAKE_PROFIT_PIPS 30.0
#define HARD_PROFIT_TARGET_PER_001 0.30
#define HARD_DAILY_LOSS_PERCENT 1.0
#define HARD_BALANCE_EQUITY_STOP 80000000.0
#define HARD_MAX_SPREAD_PIPS 5.0

CTrade trade;
string   g_symbol = "";
datetime g_lastClosedBar = 0;
datetime g_lastReferenceAttempt = 0;
datetime g_referenceFetchedAt = 0;
datetime g_referenceDate = 0;
double   g_referenceRate = 0.0;
bool     g_referenceValid = false;
bool     g_goalLatched = false;
long     g_loginAtStart = 0;
string   g_goalLatchKey = "";
string   g_status = "Starting";

bool IsAllowedSymbol(const string symbol)
{
   string upperSymbol = symbol;
   string upperPrefix = InpSymbolPrefix;
   StringToUpper(upperSymbol);
   StringToUpper(upperPrefix);
   return StringFind(upperSymbol, upperPrefix) == 0;
}

bool IsTradingDay(const int day)
{
   switch(day)
   {
      case 0: return InpTradeSunday;
      case 1: return InpTradeMonday;
      case 2: return InpTradeTuesday;
      case 3: return InpTradeWednesday;
      case 4: return InpTradeThursday;
      case 5: return InpTradeFriday;
      case 6: return InpTradeSaturday;
   }
   return false;
}

bool IsInsideSchedule()
{
   MqlDateTime local;
   TimeToStruct(TimeLocal(), local);
   const int nowMinute = local.hour * 60 + local.min;
   const int startMinute = InpStartHour * 60 + InpStartMinute;
   const int endMinute = InpEndHour * 60 + InpEndMinute;
   if(startMinute == endMinute)
      return IsTradingDay(local.day_of_week);
   if(startMinute < endMinute)
      return IsTradingDay(local.day_of_week) && nowMinute >= startMinute && nowMinute < endMinute;
   if(nowMinute >= startMinute)
      return IsTradingDay(local.day_of_week);
   if(nowMinute < endMinute)
      return IsTradingDay((local.day_of_week + 6) % 7);
   return false;
}

int PipDigitsFactor()
{
   const int digits = (int)SymbolInfoInteger(g_symbol, SYMBOL_DIGITS);
   return (digits == 3 || digits == 5) ? 10 : 1;
}

double PipSize()
{
   return SymbolInfoDouble(g_symbol, SYMBOL_POINT) * PipDigitsFactor();
}

string JsonStringValue(const string json, const string key)
{
   const string token = "\"" + key + "\"";
   int position = StringFind(json, token);
   if(position < 0) return "";
   position = StringFind(json, ":", position + StringLen(token));
   if(position < 0) return "";
   position++;
   while(position < StringLen(json) && (StringGetCharacter(json, position) == ' ' || StringGetCharacter(json, position) == '\t')) position++;
   if(position >= StringLen(json) || StringGetCharacter(json, position) != '"') return "";
   position++;
   const int end = StringFind(json, "\"", position);
   if(end < 0) return "";
   return StringSubstr(json, position, end - position);
}

double JsonNumberValue(const string json, const string key)
{
   const string token = "\"" + key + "\"";
   int position = StringFind(json, token);
   if(position < 0) return 0.0;
   position = StringFind(json, ":", position + StringLen(token));
   if(position < 0) return 0.0;
   position++;
   while(position < StringLen(json) && (StringGetCharacter(json, position) == ' ' || StringGetCharacter(json, position) == '\t')) position++;
   int end = position;
   while(end < StringLen(json))
   {
      const ushort ch = StringGetCharacter(json, end);
      if((ch >= '0' && ch <= '9') || ch == '.' || ch == '-' || ch == '+') end++;
      else break;
   }
   if(end == position) return 0.0;
   return StringToDouble(StringSubstr(json, position, end - position));
}

bool FetchDailyReference()
{
   g_lastReferenceAttempt = TimeLocal();
   char request[];
   char response[];
   string responseHeaders;
   ArrayResize(request, 0);
   ResetLastError();
   const int status = WebRequest("GET", InpReferenceUrl, "Accept: application/json\r\n", 7000, request, response, responseHeaders);
   if(status != 200)
   {
      g_status = StringFormat("Reference unavailable (HTTP %d / MT5 error %d); entries blocked", status, GetLastError());
      return false;
   }
   const string body = CharArrayToString(response, 0, -1, CP_UTF8);
   const string dateText = JsonStringValue(body, "date");
   const double rate = JsonNumberValue(body, "CAD");
   if(StringLen(dateText) != 10 || rate <= 0.0)
   {
      g_status = "Invalid daily AUD/CAD reference; entries blocked";
      return false;
   }
   string mqlDate = dateText;
   StringReplace(mqlDate, "-", ".");
   const datetime referenceDate = StringToTime(mqlDate + " 00:00");
   MqlDateTime referenceParts, todayParts;
   TimeToStruct(referenceDate, referenceParts);
   TimeToStruct(TimeLocal(), todayParts);
   todayParts.hour = 0;
   todayParts.min = 0;
   todayParts.sec = 0;
   const datetime today = StructToTime(todayParts);
   const long ageSeconds = (long)(today - referenceDate);
   if(referenceDate <= 0 || ageSeconds < 0 || ageSeconds > 7 * 86400)
   {
      g_status = "Daily reference is future-dated or older than 7 days; entries blocked";
      return false;
   }
   g_referenceRate = rate;
   g_referenceDate = referenceDate;
   g_referenceFetchedAt = TimeLocal();
   g_referenceValid = true;
   g_status = StringFormat("Daily AUD/CAD reference %.5f (%s)", rate, dateText);
   return true;
}

bool HasFreshReference()
{
   // WebRequest is unavailable in Strategy Tester; bypass is explicitly test-only.
   if(MQLInfoInteger(MQL_TESTER))
      return InpTesterAllowReferenceBypass;
   if(g_referenceValid && TimeLocal() - g_referenceFetchedAt <= REFERENCE_MAX_AGE_SECONDS)
      return true;
   if(TimeLocal() - g_lastReferenceAttempt >= 300)
      FetchDailyReference();
   return g_referenceValid && TimeLocal() - g_referenceFetchedAt <= REFERENCE_MAX_AGE_SECONDS;
}

double EmaOnClosedRates(const MqlRates &rates[], const int firstShift, const int count, const int period)
{
   const double alpha = 2.0 / (period + 1.0);
   double value = rates[firstShift + count - 1].close;
   for(int shift = firstShift + count - 2; shift >= firstShift; shift--)
      value = alpha * rates[shift].close + (1.0 - alpha) * value;
   return value;
}

bool ReadSignal(string &signal, double &rsi, datetime &closedBarTime)
{
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   const int requested = MathMax(MINIMUM_HISTORY_BARS + 1, MathMin(InpHistoryBars, 100000));
   const int copied = CopyRates(g_symbol, InpTimeframe, 0, requested, rates);
   if(copied < MINIMUM_HISTORY_BARS + 1)
   {
      g_status = StringFormat("Waiting for MT5 history: %d/%d bars", copied, MINIMUM_HISTORY_BARS + 1);
      return false;
   }
   // Array is series-indexed: [0] is the forming candle, [1] the last closed candle.
   const double fast = EmaOnClosedRates(rates, 1, 40, 20);
   const double slow = EmaOnClosedRates(rates, 1, 50, 50);
   double gains = 0.0, losses = 0.0;
   for(int shift = 15; shift >= 2; shift--)
   {
      const double change = rates[shift - 1].close - rates[shift].close;
      if(change > 0.0) gains += change;
      else losses -= change;
   }
   rsi = losses == 0.0 ? 100.0 : 100.0 - (100.0 / (1.0 + gains / losses));
   signal = (fast > slow && rsi < 70.0) ? "BUY" : (fast < slow && rsi > 30.0) ? "SELL" : "WAIT";
   closedBarTime = rates[1].time;
   return true;
}

bool ReadHistoryStats(int &closedCount, double &winRate, int &consecutiveLosses, datetime &lastLossTime)
{
   closedCount = 0;
   winRate = -1.0;
   consecutiveLosses = 0;
   lastLossTime = 0;
   if(!HistorySelect(TimeCurrent() - 30 * 86400, TimeCurrent()))
      return false;
   const int total = HistoryDealsTotal();
   double recentPnl[20];
   ArrayInitialize(recentPnl, 0.0);
   int recentCount = 0;
   bool streakEnded = false;
   for(int index = total - 1; index >= 0; index--)
   {
      const ulong deal = HistoryDealGetTicket(index);
      if(deal == 0) continue;
      if(HistoryDealGetString(deal, DEAL_SYMBOL) != g_symbol) continue;
      if(HistoryDealGetInteger(deal, DEAL_MAGIC) != InpMagic) continue;
      const long entry = HistoryDealGetInteger(deal, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY && entry != DEAL_ENTRY_INOUT) continue;
      const double pnl = HistoryDealGetDouble(deal, DEAL_PROFIT)
                       + HistoryDealGetDouble(deal, DEAL_SWAP)
                       + HistoryDealGetDouble(deal, DEAL_COMMISSION);
      const datetime dealTime = (datetime)HistoryDealGetInteger(deal, DEAL_TIME);
      closedCount++;
      if(recentCount < 20) recentPnl[recentCount++] = pnl;
      if(!streakEnded)
      {
         if(pnl < 0.0)
         {
            consecutiveLosses++;
            if(lastLossTime == 0) lastLossTime = dealTime;
         }
         else streakEnded = true;
      }
   }
   if(recentCount > 0)
   {
      int wins = 0;
      for(int i = 0; i < recentCount; i++) if(recentPnl[i] > 0.0) wins++;
      winRate = (double)wins / recentCount;
   }
   return true;
}

bool AccountDailyStats(double &realizedToday, double &floatingPnl, double &dayStartBalance)
{
   MqlDateTime parts;
   TimeToStruct(TimeCurrent(), parts);
   parts.hour = 0; parts.min = 0; parts.sec = 0;
   const datetime dayStart = StructToTime(parts);
   if(!HistorySelect(dayStart, TimeCurrent())) return false;
   realizedToday = 0.0;
   for(int i = 0; i < HistoryDealsTotal(); i++)
   {
      const ulong deal = HistoryDealGetTicket(i);
      if(deal == 0) continue;
      realizedToday += HistoryDealGetDouble(deal, DEAL_PROFIT)
                     + HistoryDealGetDouble(deal, DEAL_SWAP)
                     + HistoryDealGetDouble(deal, DEAL_COMMISSION);
   }
   floatingPnl = AccountInfoDouble(ACCOUNT_PROFIT);
   dayStartBalance = AccountInfoDouble(ACCOUNT_BALANCE) - realizedToday;
   return dayStartBalance > 0.0;
}

int FindOwnPosition(ulong &ticket, ENUM_POSITION_TYPE &type, double &volume, double &netProfit)
{
   int ownCount = 0;
   ticket = 0;
   volume = 0.0;
   netProfit = 0.0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      const ulong current = PositionGetTicket(i);
      if(current == 0 || PositionGetString(POSITION_SYMBOL) != g_symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      ownCount++;
      ticket = current;
      type = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      volume = PositionGetDouble(POSITION_VOLUME);
      netProfit = PositionGetDouble(POSITION_PROFIT)
                + PositionGetDouble(POSITION_SWAP);
   }
   return ownCount;
}

bool HasConflictingPosition()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      const ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || PositionGetString(POSITION_SYMBOL) != g_symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) return true;
   }
   return false;
}

bool CloseOwnPositions(const string reason)
{
   bool allClosed = true;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      const ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || PositionGetString(POSITION_SYMBOL) != g_symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      if(!trade.PositionClose(ticket))
      {
         allClosed = false;
         PrintFormat("Close failed (%s), ticket %I64u: %s", reason, ticket, trade.ResultRetcodeDescription());
      }
   }
   return allClosed;
}

bool CanTradeAtTerminal()
{
   if(!TerminalInfoInteger(TERMINAL_CONNECTED)) { g_status = "MT5 terminal disconnected"; return false; }
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED)) { g_status = "MT5 Algo Trading is disabled in the terminal"; return false; }
   if(!MQLInfoInteger(MQL_TRADE_ALLOWED)) { g_status = "EA trading is disabled in MT5 EA properties"; return false; }
   if(!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED) || !AccountInfoInteger(ACCOUNT_TRADE_EXPERT)) { g_status = "Broker/account does not permit expert trading"; return false; }
   if(!InpArmTrading) { g_status = "Paused: set InpArmTrading=true after Demo checks"; return false; }
   const long mode = AccountInfoInteger(ACCOUNT_TRADE_MODE);
   if(mode != ACCOUNT_TRADE_MODE_DEMO && mode != ACCOUNT_TRADE_MODE_REAL) { g_status = "Only MT5 Demo or explicitly confirmed Live accounts are supported"; return false; }
   if(mode == ACCOUNT_TRADE_MODE_REAL && !MQLInfoInteger(MQL_TESTER) && (!InpAllowLiveTrading || InpLiveConfirmation != "LIVE"))
   {
      g_status = "Live trading blocked: explicitly set AllowLive and type LIVE in EA inputs";
      return false;
   }
   return true;
}

double NormalizeLots()
{
   const double step = SymbolInfoDouble(g_symbol, SYMBOL_VOLUME_STEP);
   const double minimum = SymbolInfoDouble(g_symbol, SYMBOL_VOLUME_MIN);
   const double maximum = MathMin(SymbolInfoDouble(g_symbol, SYMBOL_VOLUME_MAX), HARD_MAX_LOTS);
   if(step <= 0.0 || minimum <= 0.0 || maximum < minimum) return 0.0;
   const double lots = MathFloor((maximum + 1e-10) / step) * step;
   if(lots < minimum || lots > HARD_MAX_LOTS + 1e-10) return 0.0;
   int digits = 0;
   double probe = step;
   while(digits < 8 && MathAbs(probe - MathRound(probe)) > 1e-8) { probe *= 10.0; digits++; }
   return NormalizeDouble(lots, digits);
}

bool SendEntry(const string side, const double rsi)
{
   if(!CanTradeAtTerminal()) return false;
   if(!IsInsideSchedule()) { g_status = "Outside configured local trading schedule"; return false; }
   if(!HasFreshReference()) return false;
   if(HasConflictingPosition()) { g_status = "Another/manual position exists on this symbol; entry blocked"; return false; }
   const double pip = PipSize();
   const double point = SymbolInfoDouble(g_symbol, SYMBOL_POINT);
   MqlTick tick;
   if(!SymbolInfoTick(g_symbol, tick)) { g_status = "No valid live quote"; return false; }
   const double ask = tick.ask;
   const double bid = tick.bid;
   if(pip <= 0.0 || point <= 0.0 || ask <= 0.0 || bid <= 0.0 || tick.time <= 0) { g_status = "No valid live quote"; return false; }
   const long tickAge = (long)(TimeCurrent() - tick.time);
   if(tickAge > 30 || tickAge < -120) { g_status = "MT5 quote is stale or the terminal clock is skewed; entry blocked"; return false; }
   const double spread = (ask - bid) / pip;
   if(spread > HARD_MAX_SPREAD_PIPS) { g_status = StringFormat("Spread %.2f pips exceeds limit %.2f", spread, HARD_MAX_SPREAD_PIPS); return false; }
   const double lots = NormalizeLots();
   if(lots <= 0.0) { g_status = "Broker minimum/step exceeds the 0.01-lot hard cap"; return false; }
   const long minStopPoints = MathMax(SymbolInfoInteger(g_symbol, SYMBOL_TRADE_STOPS_LEVEL), SymbolInfoInteger(g_symbol, SYMBOL_TRADE_FREEZE_LEVEL));
   const double stopDistance = MathMax(HARD_STOP_LOSS_PIPS * pip, minStopPoints * point);
   const double takeDistance = MathMax(HARD_TAKE_PROFIT_PIPS * pip, minStopPoints * point);
   const int digits = (int)SymbolInfoInteger(g_symbol, SYMBOL_DIGITS);
   const bool isBuy = side == "BUY";
   const double price = isBuy ? ask : bid;
   const double sl = NormalizeDouble(isBuy ? price - stopDistance : price + stopDistance, digits);
   const double tp = NormalizeDouble(isBuy ? price + takeDistance : price - takeDistance, digits);
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(20);
   trade.SetTypeFillingBySymbol(g_symbol);
   const bool sent = isBuy
      ? trade.Buy(lots, g_symbol, 0.0, sl, tp, "MoneyWork EMA RSI")
      : trade.Sell(lots, g_symbol, 0.0, sl, tp, "MoneyWork EMA RSI");
   if(!sent)
   {
      g_status = "Order rejected by MT5/broker: " + trade.ResultRetcodeDescription();
      Print(g_status);
      return false;
   }
   g_status = StringFormat("%s %.2f lot sent; RSI %.1f; SL/TP attached", side, lots, rsi);
   Print(g_status);
   return true;
}

void OnTick()
{
   if((long)AccountInfoInteger(ACCOUNT_LOGIN) != g_loginAtStart)
   {
      g_status = "Account changed; remove and reattach this EA to revalidate permissions";
      Comment("Money Work EA\n", g_status);
      return;
   }
   string signal;
   double rsi = 50.0;
   datetime closedBarTime = 0;
   const bool haveSignal = ReadSignal(signal, rsi, closedBarTime);

   double realizedToday = 0.0, floatingPnl = 0.0, dayStartBalance = 0.0;
   if(!AccountDailyStats(realizedToday, floatingPnl, dayStartBalance))
   {
      g_status = "Could not read account daily history; new orders blocked";
      Comment("Money Work EA\n", g_status);
      return;
   }
   const double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   const double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   const double dailyPnl = realizedToday + floatingPnl;
   const double capValue = MathMax(balance, equity);
   if(capValue >= HARD_BALANCE_EQUITY_STOP && !g_goalLatched)
   {
      g_goalLatched = true;
      if(!MQLInfoInteger(MQL_TESTER) && StringLen(g_goalLatchKey) > 0)
         GlobalVariableSet(g_goalLatchKey, (double)TimeCurrent());
   }
   const bool capitalStop = g_goalLatched;
   const bool dailyStop = dailyPnl <= -(dayStartBalance * HARD_DAILY_LOSS_PERCENT / 100.0);
   if(capitalStop || dailyStop)
   {
      CloseOwnPositions(capitalStop ? "80m balance/equity stop" : "daily loss stop");
      g_status = capitalStop ? "80,000,000 account-currency stop latched" : "Daily loss stop active; new entries blocked";
      Comment("Money Work EA\n", g_status, "\nBalance ", DoubleToString(balance, 2), " | Equity ", DoubleToString(equity, 2));
      return;
   }

   ulong ticket;
   ENUM_POSITION_TYPE positionType = POSITION_TYPE_BUY;
   double volume, positionPnl;
   const int ownPositions = FindOwnPosition(ticket, positionType, volume, positionPnl);
   if(ownPositions > 0)
   {
      const double target = HARD_PROFIT_TARGET_PER_001 * volume / 0.01;
      const bool opposite = haveSignal && ((positionType == POSITION_TYPE_BUY && signal == "SELL") || (positionType == POSITION_TYPE_SELL && signal == "BUY"));
      if(positionPnl >= target)
      {
         if(trade.PositionClose(ticket)) g_status = StringFormat("Closed EA position at %.2f account currency target", target);
         else g_status = "Profit-target close failed: " + trade.ResultRetcodeDescription();
      }
      else if(!IsInsideSchedule() || opposite)
      {
         if(trade.PositionClose(ticket)) g_status = !IsInsideSchedule() ? "Closed EA position outside schedule" : "Closed EA position on opposite signal";
         else g_status = "Protective exit failed: " + trade.ResultRetcodeDescription();
      }
      Comment("Money Work EA\n", g_status, "\nEA position P/L ", DoubleToString(positionPnl, 2), " / target ", DoubleToString(target, 2));
      return;
   }

   if(!haveSignal)
   {
      Comment("Money Work EA\n", g_status);
      return;
   }
   if(closedBarTime == g_lastClosedBar)
   {
      Comment("Money Work EA\n", g_status, "\nSignal ", signal, " | RSI ", DoubleToString(rsi, 1));
      return;
   }
   g_lastClosedBar = closedBarTime;

   if(signal == "WAIT")
   {
      g_status = "No directional EMA/RSI signal";
      Comment("Money Work EA\n", g_status, "\nRSI ", DoubleToString(rsi, 1));
      return;
   }
   if(!CanTradeAtTerminal()) { Comment("Money Work EA\n", g_status); return; }
   if(!IsInsideSchedule()) { g_status = "Outside configured local trading schedule"; Comment("Money Work EA\n", g_status); return; }
   if(!HasFreshReference()) { Comment("Money Work EA\n", g_status); return; }

   int closedCount, consecutiveLosses;
   double winRate;
   datetime lastLossTime;
   if(!ReadHistoryStats(closedCount, winRate, consecutiveLosses, lastLossTime))
   {
      g_status = "Could not read EA trade history; new entries blocked";
      Comment("Money Work EA\n", g_status);
      return;
   }
   if(consecutiveLosses >= 2 && lastLossTime > 0 && TimeCurrent() < lastLossTime + 3600)
   {
      g_status = "One-hour pause after two consecutive EA losses";
      Comment("Money Work EA\n", g_status);
      return;
   }
   if(closedCount >= 5 && winRate >= 0.0 && winRate < 0.4)
   {
      if((signal == "BUY" && rsi >= 60.0) || (signal == "SELL" && rsi <= 40.0))
      {
         g_status = "Adaptive RSI filter blocked entry after weak recent win rate";
         Comment("Money Work EA\n", g_status);
         return;
      }
   }
   SendEntry(signal, rsi);
   Comment("Money Work EA\n", g_status, "\nSignal ", signal, " | RSI ", DoubleToString(rsi, 1), " | Daily P/L ", DoubleToString(dailyPnl, 2));
}

int OnInit()
{
   g_symbol = _Symbol;
   if(!IsAllowedSymbol(g_symbol))
   {
      Print("Money Work EA is limited to AUDCAD symbols; current chart is ", g_symbol);
      return INIT_FAILED;
   }
   if(InpHistoryBars < MINIMUM_HISTORY_BARS + 1 || InpStartHour < 0 || InpStartHour > 23 || InpEndHour < 0 || InpEndHour > 23 || InpStartMinute < 0 || InpStartMinute > 59 || InpEndMinute < 0 || InpEndMinute > 59)
   {
      Print("Invalid history or schedule inputs.");
      return INIT_PARAMETERS_INCORRECT;
   }
   g_loginAtStart = (long)AccountInfoInteger(ACCOUNT_LOGIN);
   if(g_loginAtStart <= 0)
   {
      Print("Log in to an MT5 Demo account before attaching Money Work EA.");
      return INIT_FAILED;
   }
   g_goalLatchKey = StringFormat("MWG_%I64d_%I64d", g_loginAtStart, InpMagic);
   g_goalLatched = !MQLInfoInteger(MQL_TESTER) && GlobalVariableCheck(g_goalLatchKey);
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetTypeFillingBySymbol(g_symbol);
   EventSetTimer(60);
   FetchDailyReference();
   Print("Money Work EA initialized on ", g_symbol, " / ", EnumToString(InpTimeframe), ". Starts paused unless InpArmTrading=true.");
   return INIT_SUCCEEDED;
}

void OnTimer()
{
   if(!g_referenceValid || TimeLocal() - g_referenceFetchedAt >= REFERENCE_REFRESH_SECONDS || TimeLocal() - g_lastReferenceAttempt >= 300)
      FetchDailyReference();
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Comment("");
}
