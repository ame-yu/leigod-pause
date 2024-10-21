#!/usr/bin/env -S deno run -A --
import * as path from "https://deno.land/std@0.208.0/path/mod.ts"
import { Hash, encode } from "https://deno.land/x/checksum@1.2.0/mod.ts"

const isCompiled = Deno.args.includes("--is_compiled")
if (isCompiled) Deno.chdir(path.dirname(Deno.execPath()))
const ROUTE = {
  USER_LOGIN: "https://webapi.leigod.com/api/auth/login/v1",
  USER_INFO: "https://webapi.leigod.com/api/user/info",
  PAUSE_ACTION: "https://webapi.leigod.com/api/user/pause",
  SALT_KEY_JS: "https://www.leigod.com/js/index.js"
}

const defaultHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.96 Safari/537.36 Edg/88.0.705.53",
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  Connection: "keep-alive",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Encoding": "gzip, deflate, br",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
  Referer: "https://www.legod.com/",
}
function writeConfig(config) {
  Deno.writeTextFileSync("config.json", JSON.stringify(config, null, 2))
}

async function readConfig() {
  try {
    let conf = Deno.readTextFileSync("config.json")
    return JSON.parse(conf)
  } catch (e) {
    console.log("没有config.json,请以手机号+密码登录")
    let username = prompt("手机号:")
    let password = prompt("密码:")
    let passwordMD5 = new Hash("md5").digest(encode(password)).hex()
    writeConfig({ username, passwordMD5, token: null })
    return { username, passwordMD5 }
  }
}

async function getUserInfo(token, retry = 3) {
  panicIf(retry <= 0, "获取用户信息失败，超出尝试上限，请检查账号密码")
  const resp = await fetch(ROUTE.USER_INFO, {
    method: "POST",
    headers: defaultHeaders,
    body: new URLSearchParams({
      lang: "zh_CN",
      account_token: token,
    }).toString(),
  })

  let json = await resp.json()

  if (json.code == 400006) {
    console.log("token无效，正在重新登录")
    token = await login(username, passwordMD5)
    json.data = await getUserInfo(token, retry - 1)
  }

  return json.data
}

async function getSaltKey(params) {
  const resp = await fetch(ROUTE.SALT_KEY_JS)
  const text = await resp.text()
  const reg = /"[A-Z0-9]{24,}"/g
  const match = text.match(reg)?.[0]
  return match?.slice(1, -1)
}

async function login(username, password) {
  let saltKey = await getSaltKey(username)
  let paramsStr = new URLSearchParams({
    account_token: "null",
    country_code: 86,
    lang: "zh_CN",
    mobile_num: username,
    os_type: 4,
    password,
    region_code: 1,
    src_channel: "guanwang",
    ts: `${Date.now() / 1000}`,
    username
  }).toString()
  let saltParams = paramsStr + "&key=" + saltKey
  let sign = new Hash("md5").digest(encode(saltParams)).hex()
  
  const resp = await fetch(ROUTE.USER_LOGIN, {
    method: "POST",
    headers: defaultHeaders,
    body: paramsStr + "&sign=" + sign,
  })

  panicIf(resp.status != 200, "登录失败:" + resp.status)

  const json = await resp.json()

  token = json?.data?.login_info?.account_token

  panicIf(!token, "登录失败，token获取失败，请检查账号密码")

  writeConfig({ username, passwordMD5: password, token })
  return token
}

async function pause(token) {
  const resp = await fetch(ROUTE.PAUSE_ACTION, {
    method: "POST",
    headers: defaultHeaders,
    body: new URLSearchParams({
      lang: "zh_CN",
      account_token: token,
    }).toString(),
  })

  let json = await resp.json()
  console.log(json.msg)
}

const panicIf = (bool, msg) => bool && console.error(msg) + Deno.exit(1)

const config = await readConfig()
let { username, passwordMD5, token } = config
const userInfo = await getUserInfo(token)
console.log(`剩余${parseInt(userInfo.user_pause_time / 3600)}小时`)
await pause(token)
