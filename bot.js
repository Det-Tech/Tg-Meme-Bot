const axios = require("axios").default;
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const TeleBot = require("telebot");
const { rword } = require("rword");

const { fetchMeme, fetchMemeTemplate } = require("./meme");
const { connectToRedis } = require("./redis");
const { cleanUpImages } = require("./utils");
const { createCanvas, loadImage, registerFont } = require("canvas");

require("dotenv").config();

const path = require("path");

// Register the custom font
registerFont(path.resolve(__dirname, "./impact.ttf"), {
    family: "CustomFont",
});

// Created bot object
const bot = new TeleBot({
    token: process.env.TELEGRAM_KEY, // Required. Telegram Bot API token.
});

let client = null;

const url = "https://api.imgflip.com/caption_image";

const app = express();

const port = process.env.PORT || 3600;

// parse the updates to JSON
app.use(express.json());

app.use(cors());
app.use(helmet());
app.use(morgan("combined"));

// We are receiving updates at the route below!
app.post(`/bot/${process.env.TELEGRAM_KEY}`, (req, res) => {
    bot.receiveUpdates([req.body]);

    // bot.receiveUpdates(req.body);
    res.status(200).send("ok");
});

// Start Express Server
app.listen(port, async () => {
    console.log(`Memer bot server is listening on ${port}`);
    client = await connectToRedis();
    setInterval(() => cleanUpImages(), 300000);
});

bot.on("error", (err) => {
    console.log("Some error occured", err);
});

// Start
bot.on(/\/start/, async (msg) => {
    await bot.sendMessage(msg.chat.id, "🍔 Welcome to MemeAI 🌭");
    await client.set(msg.chat.id.toString(), JSON.stringify({ state: "NONE" }));

    await bot.sendMessage(
        msg.chat.id,
        `Your all in 1 tool to edit, generate and randomize your own custom memes. To begin please select from the Below List

🖼 AI Image - Create an AI generate image + add your own text
🌍 Custom Image - Insert your own picture + add your own text
🚨 Randomizer - Generates multiple memes based on your search term
✔️ Preset - Searches the Internet for pre-existing memes        
  `,
        {
            replyMarkup: {
                inline_keyboard: [
                    [
                        {
                            text: "🖼 AI Image",
                            callback_data: "AI_TYPE",
                        },
                        {
                            text: "🌍 Custom Image",
                            callback_data: "CUSTOM_TYPE",
                        },
                        {
                            text: "🚨 Randomizer",
                            callback_data: "TEMPLATE_TYPE",
                        },
                        {
                            text: "✔️ Preset",
                            callback_data: "SEARCH_TYPE",
                        },
                    ],
                ],
            },
        }
    );

    await client.set(
        msg.chat.id.toString(),
        JSON.stringify({ state: "CREATE_STARTED" })
    );
});

// Reply to hey, hi, hello
bot.on(/^hi$|^hey$|^hello$/i, async (msg) => {
    await bot.sendMessage(msg.chat.id, "🍔 Welcome to MemeAI 🌭");
    await client.set(msg.chat.id.toString(), JSON.stringify({ state: "NONE" }));

    await bot.sendMessage(
        msg.chat.id,
        `Your all in 1 tool to edit, generate and randomize your own custom memes. To begin please select from the Below List

🖼 AI Image - Create an AI generate image + add your own text
🌍 Custom Image - Insert your own picture + add your own text
🚨 Randomizer - Generates multiple memes based on your search term
✔️ Preset - Searches the Internet for pre-existing memes        
  `,
        {
            replyMarkup: {
                inline_keyboard: [
                    [
                        {
                            text: "🖼 AI Image",
                            callback_data: "AI_TYPE",
                        },
                        {
                            text: "🌍 Custom Image",
                            callback_data: "CUSTOM_TYPE",
                        },
                        {
                            text: "🚨 Randomizer",
                            callback_data: "TEMPLATE_TYPE",
                        },
                        {
                            text: "✔️ Preset",
                            callback_data: "SEARCH_TYPE",
                        },
                    ],
                ],
            },
        }
    );

    await client.set(
        msg.chat.id.toString(),
        JSON.stringify({ state: "CREATE_STARTED" })
    );
});

// Reset states
bot.on(/\/reset/, async (msg) => {
    console.log("msg id", msg.chat.id);
    await client.set(msg.chat.id.toString(), JSON.stringify({ state: "NONE" }));
    bot.sendMessage(
        msg.chat.id,
        "Resetted state. Now you can try searching or creating memes again"
    );
});

// Search error
bot.on(/^\/search$/, async (msg) => {
    await client.set(msg.chat.id.toString(), JSON.stringify({ state: "NONE" }));
    bot.sendMessage(msg.chat.id, "Send search term like /search <search-term>");
});

// Search
bot.on(/^\/search (.+)$/, async (msg, props) => {
    await client.set(msg.chat.id.toString(), JSON.stringify({ state: "NONE" }));

    console.log({ props });

    const text = props.match[0];

    if (text) {
        const searchText = text.substring(7);

        console.log("searchText, preset", searchText);

        await bot.sendMessage(msg.chat.id, "Searching...");

        await bot.sendMessage(msg.chat.id, "Enjoy your tailored content below 👇");

        let memeSrcs = await fetchMeme(searchText);

        if (memeSrcs && memeSrcs.length > 0) {
            console.log("Got Search " + memeSrcs);

            for(let i = 0; i <memeSrcs.length; i++){
                let memeSrc;
                if (memeSrcs[i].substring(0, 2) === "//") {
                    memeSrc = "http://" + memeSrcs[i].substring(2);
                } else {
                    memeSrc = "https://imgflip.com" + memeSrcs[i];
                }

                await bot.sendPhoto(msg.chat.id, memeSrc);
            }

            await bot.sendMessage(
                msg.chat.id,
                `Please select the return button to start again`,
                {
                    replyMarkup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "Return",
                                    callback_data: "CREATE_TEMPLATE_FINISHED",
                                },
                            ],
                        ],
                    },
                }
            );
            await client.set(
                msg.chat.id.toString(),
                JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
            );
        } else {
            await bot.sendMessage(
                msg.chat.id,
                "Sorry " +
                    msg.from.first_name +
                    ", I couldn't find a meme for you 😢",
                    {
                        replyMarkup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "Return",
                                        callback_data: "CREATE_TEMPLATE_FINISHED",
                                    },
                                ],
                            ],
                        },
                    }
            );
            await client.set(
                msg.chat.id.toString(),
                JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
            );
        }
    }
});

// Handle callback queries
bot.on("callbackQuery", async (callbackQuery) => {
    const action = callbackQuery.data;
    const msg = callbackQuery.message;

    console.log(action);

    if (action == "TEMPLATE_TYPE") {
        // randomizer
        bot.sendMessage(
            msg.chat.id,
            "Searching Template Photos to begin your meme creation🔎"
        );

        await client.set(
            msg.chat.id.toString(),
            JSON.stringify({ state: "CREATE_TEMPLATE_SEARCH" })
        );

        await client.set(
            msg.chat.id.toString(),
            JSON.stringify({ state: "NONE" })
        );

        console.log("rword: ", rword.generate());
        const memeTemplates = await fetchMemeTemplate(rword.generate());

        if (!!memeTemplates && memeTemplates.length > 0) {
            await bot.sendMessage(
                msg.chat.id,
                `Choose from any of the templates below👇`
            );

            const tempMsgMap = [];

            for (let memeTemplate of memeTemplates) {
                let { image, id } = memeTemplate;

                if (image && id) {
                    console.log("Got Search " + image);
                    if (image.substring(0, 2) === "//") {
                        image = "http://" + image.substring(2);
                    } else {
                        image = "https://imgflip.com" + image;
                    }

                    const message = await bot.sendPhoto(msg.chat.id, image, {
                        replyMarkup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "Select",
                                        callback_data: "TEMPLATE_YES ID: " + id,
                                    },
                                ],
                            ],
                        },
                    });

                    console.log(message);

                    if (message)
                        tempMsgMap.push({
                            templateId: id,
                            messageId: message.message_id,
                        });
                }
            }

            await client.set(
                msg.chat.id.toString(),
                JSON.stringify({ state: "CREATE_TEMPLATE_YES", tempMsgMap })
            );
        } else {
            bot.sendMessage(
                msg.chat.id,
                "Sorry " +
                    msg.from.first_name +
                    ", I couldn't find a meme template for you 😢. Please try again"
            );
        }
    }
    if (action == "SEARCH_TYPE") {
        // preset
        bot.sendMessage(
            msg.chat.id,
            "Type /search <search-term> to received personalised & tailored content 🔎"
        );

        await client.set(
            msg.chat.id.toString(),
            JSON.stringify({ state: "CREATE_TEMPLATE_SEARCH" })
        );
    } else if (action.includes("TEMPLATE_YES")) {
        let templateId = action.split(" ")[2];

        const chatDataString = await client.get(msg.chat.id.toString());

        const chatData = chatDataString ? JSON.parse(chatDataString) : null;

        const tempMsgMap = chatData.tempMsgMap;

        if (
            tempMsgMap &&
            tempMsgMap.find((m) => m.templateId == templateId) &&
            tempMsgMap.find((m) => m.templateId == templateId).messageId
        ) {
            console.log("templateId", templateId);

            bot.sendMessage(
                msg.chat.id,
                "Great Choice, Now lets add a Header and footer✅",
                {
                    replyToMessage: tempMsgMap.find(
                        (m) => m.templateId == templateId
                    ).messageId,
                }
            );

            bot.sendMessage(
                msg.chat.id,
                "Write your 'Header' below (Type . to skip) ↩️"
            );
            await client.set(
                msg.chat.id.toString(),
                JSON.stringify({
                    ...chatData,
                    state: "CREATE_TEMPLATE_TOP",
                    templateId: templateId,
                })
            );
        }
    } else if (action == "CUSTOM_TYPE") {
        bot.sendMessage(
            msg.chat.id,
            "Please Insert your personal image below to begin⬇️"
        );

        await client.set(
            msg.chat.id.toString(),
            JSON.stringify({ state: "CREATE_CUSTOM_IMAGE_UPLOAD" })
        );
    } else if (action == "AI_TYPE") {
        bot.sendMessage(
            msg.chat.id,
            "Please insert your word/phrase to generate an image below↩️"
        );

        await client.set(
            msg.chat.id.toString(),
            JSON.stringify({ state: "CREATE_AI" })
        );
    } else if (action == "CREATE_TEMPLATE_FINISHED") {
        await bot.sendMessage(msg.chat.id, "🍔 Welcome to MemeAI 🌭");
    await client.set(msg.chat.id.toString(), JSON.stringify({ state: "NONE" }));

    await bot.sendMessage(
        msg.chat.id,
        `Your all in 1 tool to edit, generate and randomize your own custom memes. To begin please select from the Below List

🖼 AI Image - Create an AI generate image + add your own text
🌍 Custom Image - Insert your own picture + add your own text
🚨 Randomizer - Generates multiple memes based on your search term
✔️ Preset - Searches the Internet for pre-existing memes        
  `,
        {
            replyMarkup: {
                inline_keyboard: [
                    [
                        {
                            text: "🖼 AI Image",
                            callback_data: "AI_TYPE",
                        },
                        {
                            text: "🌍 Custom Image",
                            callback_data: "CUSTOM_TYPE",
                        },
                        {
                            text: "🚨 Randomizer",
                            callback_data: "TEMPLATE_TYPE",
                        },
                        {
                            text: "✔️ Preset",
                            callback_data: "SEARCH_TYPE",
                        },
                    ],
                ],
            },
        }
    );

    await client.set(
        msg.chat.id.toString(),
        JSON.stringify({ state: "CREATE_STARTED" })
    );
    }
});

// Handle create meme data
bot.on(/(.*)/, async (msg, props) => {
    try {
        const chatDataString = await client.get(msg.chat.id.toString());
        const chatData = chatDataString ? JSON.parse(chatDataString) : null;

        if (chatData && chatData.state === "CREATE_TEMPLATE_TOP") {
            const text = props.match[0];

            console.log("topText", text);

            let topText = "";

            if (text === ".") {
            } else {
                topText = text;
            }
            bot.sendMessage(
                msg.chat.id,
                "Write your 'Footer' below (Type . to skip) ↩️"
            );

            await client.set(
                msg.chat.id.toString(),
                JSON.stringify({
                    state: "CREATE_TEMPLATE_BOTTOM",
                    templateId: chatData.templateId,
                    topText: topText,
                })
            );
        } else if (chatData && chatData.state === "CREATE_TEMPLATE_BOTTOM") {
            const text = props.match[0];

            console.log("bottomText", text);

            let bottomText = "";

            if (text === ".") {
            } else {
                bottomText = text;
            }

            // Generate meme
            const response = await axios.post(
                url,
                new URLSearchParams(
                    {
                        template_id: chatData.templateId,
                        username: process.env.IMGFLIP_USERNAME,
                        password: process.env.IMGFLIP_PASSWORD,
                        text0: chatData.topText,
                        text1: bottomText,
                    },
                    {
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded",
                        },
                    }
                )
            );

            if (
                response.status == 200 &&
                !!response.data &&
                response.data.success &&
                response.data.data.url
            ) {
                await bot.sendMessage(msg.chat.id, `Meme 👇`);
                await bot.sendPhoto(msg.chat.id, response.data.data.url);

                await bot.sendMessage(
                    msg.chat.id,
                    `Please select the return button to start again`,
                    {
                        replyMarkup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "Return",
                                        callback_data: "CREATE_TEMPLATE_FINISHED",
                                    },
                                ],
                            ],
                        },
                    }
                );
                await client.set(
                    msg.chat.id.toString(),
                    JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
                );
            } else {
                console.log(
                    "Error occured while generating meme from meme template",
                    {
                        response,
                    }
                );

                bot.sendMessage(
                    msg.chat.id,
                    `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`,
                    {
                        replyMarkup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "Return",
                                        callback_data: "CREATE_TEMPLATE_FINISHED",
                                    },
                                ],
                            ],
                        },
                    }
                );

                await client.set(
                    msg.chat.id.toString(),
                    JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
                );
            }
        } else if (chatData && chatData.state === "CREATE_CUSTOM_IMAGE_TOP") {
            const text = props.match[0];

            console.log("topText", text);

            let topText = "";

            if (text === ".") {
            } else {
                topText = text;
            }
            bot.sendMessage(
                msg.chat.id,
                "Write your 'Footer' below (Type . to skip) ↩️"
            );

            await client.set(
                msg.chat.id.toString(),
                JSON.stringify({
                    state: "CREATE_CUSTOM_IMAGE_BOTTOM",
                    image: chatData.image,
                    topText: topText,
                })
            );
        } else if (
            chatData &&
            chatData.state === "CREATE_CUSTOM_IMAGE_BOTTOM"
        ) {
            const text = props.match[0];

            console.log("bottomText", text);

            let bottomText = "";

            if (text === ".") {
            } else {
                bottomText = text;
            }

            await generateCustomMeme(msg, bottomText);
        } else if (chatData && chatData.state === "CREATE_AI") {
            const text = props.match[0];

            console.log("Text for AI", text);
            await bot.sendMessage(msg.chat.id, "Generating Meme...");

            const res = await generateMemeWithDalle3(text);
            if (res?.success) {
                await bot.sendPhoto(msg.chat.id, res.url);
                await bot.sendMessage(
                    msg.chat.id,
                    "Write your 'Header' below (Type . to skip) ↩️"
                );
            } else {
                await bot.sendMessage(
                    msg.chat.id,
                    "🔞 AI prohibits the generation of images that contain rude, violent or explicit content. Please try again ⌨️",
                    {
                        replyMarkup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "Return",
                                        callback_data: "CREATE_TEMPLATE_FINISHED",
                                    },
                                ],
                            ],
                        },
                    }
                );
                return;
            }
            // generate the ai photo with dalle 3

            await client.set(
                msg.chat.id.toString(),
                JSON.stringify({
                    state: "CREATE_AI_IMAGE_TOP",
                    image: res?.success ? res.url : "",
                    text: text,
                })
            );
        } else if (chatData && chatData.state === "CREATE_AI_IMAGE_TOP") {
            const text = props.match[0];

            console.log("topText", text);

            let topText = "";

            if (text === ".") {
            } else {
                topText = text;
            }
            bot.sendMessage(
                msg.chat.id,
                "Write your 'Footer' below (Type . to skip) ↩️"
            );

            await client.set(
                msg.chat.id.toString(),
                JSON.stringify({
                    state: "CREATE_AI_IMAGE_BOTTOM",
                    image: chatData.image,
                    topText: topText,
                })
            );
        } else if (chatData && chatData.state === "CREATE_AI_IMAGE_BOTTOM") {
            const text = props.match[0];

            console.log("bottomText", text);

            let bottomText = "";

            if (text === ".") {
            } else {
                bottomText = text;
            }

            bot.sendMessage(
                msg.chat.id,
                `Adding the Header and Footer to Meme...`
            );

            await generateCustomMeme(msg, bottomText);
        } else if (
            msg.text.includes("/start") &&
            msg.text.includes("/help") &&
            msg.text.includes("/search") &&
            msg.text.includes("/create") &&
            msg.text.includes("hi") &&
            msg.text.includes("hey") &&
            msg.text.includes("hello")
        ) {
            await client.set(
                msg.chat.id.toString(),
                JSON.stringify({ state: "NONE" })
            );

            // Tell user I can't understand this and show help

            await bot.sendMessage(
                msg.chat.id,
                `Your all in 1 tool to edit, generate and randomize your own custom memes. To begin please select from the Below List
        
        🖼 AI Image - Create an AI generate image + add your own text
        🌍 Custom Image - Insert your own picture + add your own text
        🚨 Randomizer - Generates multiple memes based on your search term
        ✔️ Preset - Searches the Internet for pre-existing memes        
          `,
                {
                    replyMarkup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "🖼 AI Image",
                                    callback_data: "AI_TYPE",
                                },
                                {
                                    text: "🌍 Custom Image",
                                    callback_data: "CUSTOM_TYPE",
                                },
                                {
                                    text: "🚨 Randomizer",
                                    callback_data: "TEMPLATE_TYPE",
                                },
                                {
                                    text: "✔️ Preset",
                                    callback_data: "SEARCH_TYPE",
                                },
                            ],
                        ],
                    },
                }
            );
        }
    } catch (err) {
        console.log("Error occurred ", err);

        bot.sendMessage(
            msg.chat.id,
            `Sorry ${msg.from.first_name}, There was some error & I couldn't help you 😢. Please try again 🥺`,
            {
                replyMarkup: {
                    inline_keyboard: [
                        [
                            {
                                text: "Return",
                                callback_data: "CREATE_TEMPLATE_FINISHED",
                            },
                        ],
                    ],
                },
            }
        );
        await client.set(
            msg.chat.id.toString(),
            JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
        );
    }
});

// Custom meme image upload handle
bot.on("photo", async (msg) => {
    const chatDataString = await client.get(msg.chat.id.toString());
    const chatData = chatDataString ? JSON.parse(chatDataString) : null;

    if (chatData && chatData.state === "CREATE_CUSTOM_IMAGE_UPLOAD") {
        bot.sendMessage(
            msg.chat.id,
            "Write your 'Header' below (Type . to skip) ↩️"
        );

        await client.set(
            msg.chat.id.toString(),
            JSON.stringify({
                state: "CREATE_CUSTOM_IMAGE_TOP",
                image: msg.photo[msg.photo.length - 1].file_id,
            })
        );
    }
});

generateCustomMeme = async (msg, bottomText) => {
    let stream = null;

    try {
        const chatDataString = await client.get(msg.chat.id.toString());
        const chatData = chatDataString ? JSON.parse(chatDataString) : null;

        // Get image
        const image = chatData.image;

        console.log(chatData);

        let fileDetails;
        if (chatData.state != "CREATE_AI_IMAGE_BOTTOM") {
            // Get image file from telegram using file_id
            fileDetails = await bot.getFile(image);
            console.log("File Details", fileDetails);
        }

        if (
            fileDetails &&
            chatData.state != "CREATE_AI_IMAGE_BOTTOM" &&
            fileDetails.fileLink
        ) {
            // Download image
            try {
                const res = await axios.get(fileDetails.fileLink, {
                    responseType: "arraybuffer",
                });

                fs.writeFileSync(
                    `./images/${fileDetails.file_id}.jpg`,
                    Buffer.from(res.data),
                    "binary"
                );

                // Usage
                await addTextToImage(
                    `./images/${fileDetails.file_id}.jpg`,
                    `./images/${fileDetails.file_id}.jpg`,
                    chatData.topText,
                    bottomText
                );

                // Generate Meme
                try {
                    fs.copyFileSync(
                        `./images/${fileDetails.file_id}.jpg`,
                        `./images/meme_${fileDetails.file_id}.jpg`
                    );

                    // Send meme to user
                    await bot.sendMessage(msg.chat.id, `Meme 👇`);
                    await bot.sendPhoto(
                        msg.chat.id,
                        `./images/meme_${fileDetails.file_id}.jpg`
                    );
                    await client.set(
                        msg.chat.id.toString(),
                        JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
                    );

                    await bot.sendMessage(
                        msg.chat.id,
                        `Please select the return button to start again`,
                        {
                            replyMarkup: {
                                inline_keyboard: [
                                    [
                                        {
                                            text: "Return",
                                            callback_data: "CREATE_TEMPLATE_FINISHED",
                                        },
                                    ],
                                ],
                            },
                        }
                    );
                } catch (err) {
                    console.log(
                        "Error while generating custom meme from third party",
                        err
                    );
                    bot.sendMessage(
                        msg.chat.id,
                        `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`,
                        {
                            replyMarkup: {
                                inline_keyboard: [
                                    [
                                        {
                                            text: "Return",
                                            callback_data: "CREATE_TEMPLATE_FINISHED",
                                        },
                                    ],
                                ],
                            },
                        }
                    );
                    await client.set(
                        msg.chat.id.toString(),
                        JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
                    );
                }
            } catch (err) {
                console.log("Error while generating meme", err);
                bot.sendMessage(
                    msg.chat.id,
                    `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`,
                    {
                        replyMarkup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "Return",
                                        callback_data: "CREATE_TEMPLATE_FINISHED",
                                    },
                                ],
                            ],
                        },
                    }
                );
                await client.set(
                    msg.chat.id.toString(),
                    JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
                );
            }
        } else if (chatData.state == "CREATE_AI_IMAGE_BOTTOM") {
            // Download image
            console.log("AI image downloading... ");
            try {
                const res = await axios.get(chatData.image, {
                    responseType: "arraybuffer",
                });

                fs.writeFileSync(
                    `./images/${msg.chat.id}.jpg`,
                    Buffer.from(res.data),
                    "binary"
                );

                // Usage
                await addTextToImage(
                    `./images/${msg.chat.id}.jpg`,
                    `./images/${msg.chat.id}.jpg`,
                    chatData.topText,
                    bottomText
                );

                // Generate Meme
                try {
                    fs.copyFileSync(
                        `./images/${msg.chat.id}.jpg`,
                        `./images/meme_${msg.chat.id}.jpg`
                    );

                    // Send meme to user
                    await bot.sendMessage(msg.chat.id, `Meme 👇`);
                    await bot.sendPhoto(
                        msg.chat.id,
                        `./images/meme_${msg.chat.id}.jpg`
                    );
                    await client.set(
                        msg.chat.id.toString(),
                        JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
                    );

                    await bot.sendMessage(
                        msg.chat.id,
                        `Please select the return button to start again`,
                        {
                            replyMarkup: {
                                inline_keyboard: [
                                    [
                                        {
                                            text: "Return",
                                            callback_data: "CREATE_TEMPLATE_FINISHED",
                                        },
                                    ],
                                ],
                            },
                        }
                    );
                } catch (err) {
                    console.log(
                        "Error while generating custom meme from third party",
                        err
                    );
                    bot.sendMessage(
                        msg.chat.id,
                        `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`,
                        {
                            replyMarkup: {
                                inline_keyboard: [
                                    [
                                        {
                                            text: "Return",
                                            callback_data: "CREATE_TEMPLATE_FINISHED",
                                        },
                                    ],
                                ],
                            },
                        }
                    );
                    await client.set(
                        msg.chat.id.toString(),
                        JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
                    );
                }
            } catch (err) {
                console.log("Error while generating meme", err);
                bot.sendMessage(
                    msg.chat.id,
                    `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`,
                    {
                        replyMarkup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "Return",
                                        callback_data: "CREATE_TEMPLATE_FINISHED",
                                    },
                                ],
                            ],
                        },
                    }
                );
                await client.set(
                    msg.chat.id.toString(),
                    JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
                );
            }
        } else {
            console.log("Error occured while downloading image: ");

            bot.sendMessage(
                msg.chat.id,
                `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`,
                {
                    replyMarkup: {
                        inline_keyboard: [
                            [
                                {
                                    text: "Return",
                                    callback_data: "CREATE_TEMPLATE_FINISHED",
                                },
                            ],
                        ],
                    },
                }
            );
            await client.set(
                msg.chat.id.toString(),
                JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
            );
        }
    } catch (err) {
        console.log("Error occured while creating custom meme: ", err);

        bot.sendMessage(
            msg.chat.id,
            `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`,
            {
                replyMarkup: {
                    inline_keyboard: [
                        [
                            {
                                text: "Return",
                                callback_data: "CREATE_TEMPLATE_FINISHED",
                            },
                        ],
                    ],
                },
            }
        );

        await client.set(
            msg.chat.id.toString(),
            JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
        );

        throw err;
    }
};
 
var maxWidth = 200; // Maximum width in pixels
var maxHeight = 100; // Maximum height in pixels

// Function to add text to the image
async function addTextToImage(
    inputImagePath,
    outputImagePath,
    topText,
    bottomText
) {
    await loadImage(inputImagePath).then((image) => {
        const width = image.width;
        const height = image.height;

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, width, height);

        // Add text to the bottom center with custom font
        ctx.font = `${Math.floor(height / 10)}px CustomFont`;
        ctx.fillStyle = "white";
    
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 5;

        ctx.textAlign = "center";

        var lines = splitTextIntoLines(bottomText, width, ctx);
         console.log("lines", lines)
        for (var i = lines.length - 1; i >= 0; i--) {
            ctx.fillText(lines[i], width / 2, height - Math.floor(height / 10) * i - 30);
            ctx.strokeText(lines[i], width / 2, height - Math.floor(height / 10) * i - 30);
        }
        
        // ctx.fillText(bottomText, width / 2, height - Math.floor(height / 20));
        // ctx.strokeText(bottomText, width / 2, height - Math.floor(height / 20));
        
        var topLines = splitTextIntoLines(topText, width, ctx);
        console.log("toplines", topLines)
        for (var i = topLines.length - 1; i >= 0; i--) {
            ctx.fillText(topLines[i], width / 2, Math.floor(height / 10) * (i + 1));
            ctx.strokeText(topLines[i], width / 2, Math.floor(height / 10) * (i + 1));
        }

        // Add text to the top center with custom font
        // ctx.fillText(topText, width / 2, Math.floor(height / 5));
        // ctx.strokeText(topText, width / 2, Math.floor(height / 5));  

        // Save the modified image
        fs.writeFileSync(outputImagePath, canvas.toBuffer("image/jpeg"));
    });
}


// Function to split the text into multiple lines based on the available width
function splitTextIntoLines(text, maxWidth, ctx) {
    var words = text.split(' ');
    var lines = [];
    var currentLine = '';
  
    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      var testLine = currentLine + word + ' ';
      var metrics = ctx.measureText(testLine);
      var lineWidth = metrics.width;
  
      if (lineWidth > maxWidth && i > 0) {
        lines.push(currentLine);
        currentLine = word + ' ';
      } else {
        currentLine = testLine;
      }
    }
  
    lines.push(currentLine);
    return lines;
}

// Function to generate the meme image using dalle 3
async function generateMemeWithDalle3(input) {
    try {
        let data = JSON.stringify({
            model: "dall-e-3",
            prompt: input,
            n: 1,
            size: "1024x1024",
        });

        let config = {
            method: "post",
            maxBodyLength: Infinity,
            url: "https://api.openai.com/v1/images/generations",
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_KEY}`,
                "Content-Type": "application/json",
            },
            data: data,
        };

        const res = await axios.request(config);
        console.log(res?.data.data[0]?.url);
        return { success: true, url: res?.data?.data[0]?.url };
    } catch (err) {
        console.log(err);
        return { success: false };
    }
}

bot.start();
